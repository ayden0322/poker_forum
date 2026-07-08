// P幣競猜 — 下注收單（規格 §3；已修 Codex 複審 H1/H2/M1/M2）
// 五道檢查任一失敗 → fail-closed 拒單，回機器可讀原因碼（規格 §3.2）：
//   MARKET_LOCKED / STALE_ODDS / ODDS_CHANGED / FEED_DOWN / LIMIT_EXCEEDED / INSUFFICIENT_BALANCE
// 鐵則：
//   - lockedOdds 一律取 server 端權威 quote，前端傳的 clientOdds 只做比對（red-team N2：永不採信）
//   - 交易內先鎖使用者 P 錢包 row（FOR UPDATE）串行化同用戶下注 → 限額聚合、封盤與 quote 重查都在鎖後（H1/H2）
//   - potentialPayout 用 Decimal 計算再 floor（H：JS 浮點 100×1.15=114.999… 會少 1 P）（M1）
//   - clientRequestId 請求級冪等：timeout 重送/雙擊回同一張單（M2）
//   - 扣款走 economy.debitInTx（條件式原子扣款 + 交易內冪等，裝飾商店實戰驗證過的路徑）

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@betting-forum/database';
import { PrismaService } from '../common/prisma.service';
import { EconomyService, InsufficientBalanceError } from '../economy/economy.service';
import { OddsPipelineService } from './odds-pipeline.service';
import { MatchLinkService } from './match-link.service';
import {
  BET_MAX_STAKE,
  BET_MIN_STAKE,
  DAILY_STAKE_CAP,
  LOCK_BUFFER_MS,
  MATCH_MARKET_STAKE_CAP,
  PREDICTION_BOARDS,
  QUOTE_MAX_AGE_MS,
} from './prediction.config';
import { isPredictionEnabled } from './prediction.flags';

export interface PlaceBetInput {
  matchId: string;
  market: 'WINLOSE' | 'OVER_UNDER';
  selection: 'HOME' | 'DRAW' | 'AWAY' | 'OVER' | 'UNDER';
  /** 大小分必帶盤口線；勝負盤不帶 */
  line?: number;
  stake: number;
  /** 使用者在前端確認當下看到的 quote 與賠率（只做比對與 ODDS_CHANGED 回報） */
  quoteId: string;
  clientOdds: number;
  /** 請求級冪等鍵（前端每次確認產生 uuid；重送回同一張單） */
  requestId?: string;
}

/** 機器可讀拒單（前端據 code 映射 UI 狀態，規格 §7.3：拒單是狀態不是錯誤） */
function reject(code: string, message: string, status: HttpStatus, data?: unknown): never {
  throw new HttpException({ code, message, data }, status);
}

type BetRow = {
  id: string;
  stake: number;
  line: Prisma.Decimal | null;
  lockedOdds: Prisma.Decimal;
  potentialPayout: number;
  status: string;
};

@Injectable()
export class BetsService {
  private readonly logger = new Logger(BetsService.name);

  constructor(
    private prisma: PrismaService,
    private economy: EconomyService,
    private pipeline: OddsPipelineService,
    private matchLink: MatchLinkService,
  ) {}

  async placeBet(userId: string, input: PlaceBetInput) {
    if (!isPredictionEnabled()) reject('PREDICTION_DISABLED', '競猜功能未開放', HttpStatus.FORBIDDEN);

    // ── 基本輸入驗證（stake 為正整數由 DTO 擋，這裡守業務上下限）
    if (input.stake < BET_MIN_STAKE || input.stake > BET_MAX_STAKE) {
      reject('LIMIT_EXCEEDED', `單注限 ${BET_MIN_STAKE}~${BET_MAX_STAKE} P`, HttpStatus.BAD_REQUEST, {
        min: BET_MIN_STAKE,
        max: BET_MAX_STAKE,
      });
    }
    if (input.market === 'OVER_UNDER' && typeof input.line !== 'number') {
      reject('LIMIT_EXCEEDED', '大小分必須指定盤口線', HttpStatus.BAD_REQUEST);
    }
    if (input.market === 'WINLOSE' && !['HOME', 'DRAW', 'AWAY'].includes(input.selection)) {
      reject('LIMIT_EXCEEDED', '勝負盤選項不合法', HttpStatus.BAD_REQUEST);
    }
    if (input.market === 'OVER_UNDER' && !['OVER', 'UNDER'].includes(input.selection)) {
      reject('LIMIT_EXCEEDED', '大小分選項不合法', HttpStatus.BAD_REQUEST);
    }

    // ── 請求級冪等：同 (userId, requestId) 已成單 → 直接回該單（M2）
    if (input.requestId) {
      const dup = await this.prisma.bet.findUnique({
        where: { userId_clientRequestId: { userId, clientRequestId: input.requestId } },
      });
      if (dup) return this.toBetResult(dup, true);
    }

    // ── 檢查 1+2：賽事存在、板塊/玩法有開、未開賽、未進封盤 buffer（交易外先擋，交易內鎖後重查）
    const match = await this.prisma.predictionMatch.findUnique({ where: { id: input.matchId } });
    if (!match) reject('MARKET_LOCKED', '賽事不存在', HttpStatus.NOT_FOUND);
    const board = PREDICTION_BOARDS[match.boardSlug];
    if (!board?.enabled || !board.markets.includes(input.market)) {
      reject('MARKET_LOCKED', '此賽事/玩法未開放競猜', HttpStatus.BAD_REQUEST);
    }
    this.assertOpen(match);

    // ── 檢查 3：quote 存在且屬於這個組合；超齡 → demand-driven 重驗（規格 §2.3）
    const lineDecimal = input.line == null ? null : new Prisma.Decimal(input.line);
    let quote = await this.prisma.oddsQuote.findUnique({ where: { id: input.quoteId } });
    if (
      !quote ||
      quote.matchId !== match.id ||
      quote.market !== input.market ||
      quote.selection !== input.selection ||
      !decimalEquals(quote.line, lineDecimal)
    ) {
      reject('STALE_ODDS', '報價不存在或不符', HttpStatus.CONFLICT);
    }

    if (Date.now() - quote.fetchedAt.getTime() > QUOTE_MAX_AGE_MS || !quote.active) {
      const ok = await this.pipeline.revalidateMatch(board, { id: match.id, apiFixtureId: match.apiFixtureId });
      if (!ok) reject('FEED_DOWN', '賠率來源暫時中斷，競猜暫停受理', HttpStatus.SERVICE_UNAVAILABLE);
      // 重驗後取同組合的最新權威 quote
      const fresh = await this.prisma.oddsQuote.findFirst({
        where: {
          matchId: match.id,
          bookmakerId: board.bookmakerId,
          market: input.market,
          selection: input.selection,
          line: lineDecimal,
          active: true,
        },
        orderBy: { fetchedAt: 'desc' },
      });
      if (!fresh) reject('FEED_DOWN', '此盤口已收盤', HttpStatus.SERVICE_UNAVAILABLE);
      quote = fresh;
    }

    // ── 檢查 4：權威賠率 vs 使用者確認的賠率（不一致 → 409 帶新值，前端走 acknowledge 流程）
    if (quote.odds.toNumber() !== input.clientOdds || quote.id !== input.quoteId) {
      reject('ODDS_CHANGED', '賠率已更新，請確認新賠率', HttpStatus.CONFLICT, {
        quoteId: quote.id,
        odds: quote.odds.toNumber(),
        line: quote.line?.toNumber() ?? null,
      });
    }

    // ── 交易：鎖錢包串行化 → 封盤/quote 重查 → 限額聚合 → 建注單 → 原子扣款
    const lockedOdds = quote.odds;
    const quoteId = quote.id;
    const potentialPayout = lockedOdds.mul(input.stake).floor().toNumber(); // Decimal 計算（M1）
    try {
      const bet = await this.prisma.$transaction(async (tx) => {
        // 0) 確保 P 錢包存在並鎖 row：同用戶並發下注在此串行化，之後的聚合/重查才可信（H1）
        await tx.walletAccount.upsert({
          where: { userId_currency: { userId, currency: 'P' } },
          create: { userId, currency: 'P', balance: 0 },
          update: {},
        });
        await tx.$queryRaw`SELECT id FROM wallet_accounts WHERE user_id = ${userId} AND currency = 'P' FOR UPDATE`;

        // 1) 封盤重查（開賽瞬間臨界競態；cron 可能剛把 status 翻掉/凍結/結算）
        const freshMatch = await tx.predictionMatch.findUniqueOrThrow({
          where: { id: match.id },
          select: { apiStatus: true, startTime: true, settledAt: true, frozenAt: true },
        });
        this.assertOpen(freshMatch);

        // 2) quote 重查（H2：檢查與成單之間 pipeline 可能翻盤，鎖到舊價就是漏洞）
        const freshQuote = await tx.oddsQuote.findUniqueOrThrow({
          where: { id: quoteId },
          select: { active: true, fetchedAt: true, odds: true },
        });
        if (
          !freshQuote.active ||
          Date.now() - freshQuote.fetchedAt.getTime() > QUOTE_MAX_AGE_MS ||
          !freshQuote.odds.equals(lockedOdds)
        ) {
          reject('STALE_ODDS', '賠率剛更新，請重新確認', HttpStatus.CONFLICT);
        }

        // 3) 限額聚合（已被錢包鎖串行化，同用戶不會並發穿透）（H1）
        const dayStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [dailyAgg, exposureAgg] = await Promise.all([
          tx.bet.aggregate({ _sum: { stake: true }, where: { userId, createdAt: { gte: dayStart } } }),
          tx.bet.aggregate({
            _sum: { stake: true },
            where: { userId, matchId: match.id, market: input.market, status: 'PENDING' },
          }),
        ]);
        if ((dailyAgg._sum.stake ?? 0) + input.stake > DAILY_STAKE_CAP) {
          reject('LIMIT_EXCEEDED', '已達每日投注總額上限', HttpStatus.BAD_REQUEST, { cap: DAILY_STAKE_CAP });
        }
        if ((exposureAgg._sum.stake ?? 0) + input.stake > MATCH_MARKET_STAKE_CAP) {
          reject('LIMIT_EXCEEDED', '已達此賽事的投注上限', HttpStatus.BAD_REQUEST, { cap: MATCH_MARKET_STAKE_CAP });
        }

        // 4) 建注單 + 原子扣款（任一步失敗整批 rollback）
        const created = await tx.bet.create({
          data: {
            userId,
            matchId: match.id,
            market: input.market,
            selection: input.selection,
            line: lineDecimal,
            stake: input.stake,
            lockedOdds,
            potentialPayout,
            quoteId,
            clientRequestId: input.requestId ?? null,
          },
        });
        await this.economy.debitInTx(tx, {
          userId,
          currency: 'P',
          amount: input.stake,
          reason: 'PREDICTION_STAKE',
          refType: 'bet',
          refId: created.id,
          idempotencyKey: `bet_stake:${created.id}`,
        });
        return created;
      });

      this.logger.log(`收單：user=${userId} bet=${bet.id} ${match.boardSlug} ${input.selection}@${lockedOdds} stake=${input.stake}`);
      return this.toBetResult(bet, false);
    } catch (e) {
      if (e instanceof InsufficientBalanceError) {
        reject('INSUFFICIENT_BALANCE', 'P 幣餘額不足', HttpStatus.BAD_REQUEST);
      }
      // clientRequestId 並發重送：兩個請求同時過了前面的冪等預查 → unique 擋下後者，回既有單（M2）
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && input.requestId) {
        const dup = await this.prisma.bet.findUnique({
          where: { userId_clientRequestId: { userId, clientRequestId: input.requestId } },
        });
        if (dup) return this.toBetResult(dup, true);
      }
      throw e; // HttpException（交易內拒單）與其他錯誤照拋
    }
  }

  /** 我的注單（附賽事資訊） */
  async listMyBets(userId: string, take = 20) {
    const bets = await this.prisma.bet.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 50),
      include: {
        match: { select: { boardSlug: true, homeName: true, awayName: true, startTime: true, apiStatus: true } },
      },
    });
    return Promise.all(bets.map(async (b) => ({
      betId: b.id,
      board: b.match.boardSlug,
      detailUrl: await this.matchLink.detailUrl(b.match.boardSlug, b.match.homeName, b.match.startTime),
      home: b.match.homeName,
      away: b.match.awayName,
      startTime: b.match.startTime,
      market: b.market,
      selection: b.selection,
      line: b.line?.toNumber() ?? null,
      stake: b.stake,
      lockedOdds: b.lockedOdds.toNumber(),
      potentialPayout: b.potentialPayout,
      status: b.status,
      settledAt: b.settledAt,
      createdAt: b.createdAt,
    })));
  }

  private toBetResult(bet: BetRow, idempotentReplay: boolean) {
    return {
      betId: bet.id,
      lockedOdds: bet.lockedOdds.toNumber(),
      line: bet.line?.toNumber() ?? null,
      stake: bet.stake,
      potentialPayout: bet.potentialPayout,
      status: bet.status,
      idempotentReplay, // true = 重送命中既有單（未重複扣款）
    };
  }

  /**
   * 收單條件：未開賽 + 未進封盤 buffer + 未凍結 + 未結算（規格 §3.2；交易內外共用）。
   * settledAt/frozenAt 檢查堵「取消/凍結期滿後 API 又翻回 NS+未來時間 → 已關場賽事被復活收注」
   * （Codex 結算複審 H1）。
   */
  private assertOpen(m: { apiStatus: string; startTime: Date; settledAt: Date | null; frozenAt: Date | null }): void {
    if (m.settledAt || m.frozenAt) reject('MARKET_LOCKED', '賽事已凍結或結算，不可競猜', HttpStatus.CONFLICT);
    if (m.apiStatus !== 'NS') reject('MARKET_LOCKED', '賽事已開賽或不可競猜', HttpStatus.CONFLICT);
    if (Date.now() >= m.startTime.getTime() - LOCK_BUFFER_MS) {
      reject('MARKET_LOCKED', '已封盤', HttpStatus.CONFLICT);
    }
  }
}

/** Decimal 空值感知比較（line 可為 null） */
function decimalEquals(a: Prisma.Decimal | null, b: Prisma.Decimal | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.equals(b);
}
