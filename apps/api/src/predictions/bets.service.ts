// P幣競猜 — 下注收單（規格 §3）
// 五道檢查任一失敗 → fail-closed 拒單，回機器可讀原因碼（規格 §3.2）：
//   MARKET_LOCKED / STALE_ODDS / ODDS_CHANGED / FEED_DOWN / LIMIT_EXCEEDED / INSUFFICIENT_BALANCE
// 鐵則：
//   - lockedOdds 一律取 server 端權威 quote，前端傳的 clientOdds 只做比對（red-team N2：永不採信）
//   - 封盤判斷（status/startTime）在 DB transaction 內重查（開賽瞬間臨界競態，規格 §3.3）
//   - 扣款走 economy.debitInTx（條件式原子扣款 + 交易內冪等，裝飾商店實戰驗證過的路徑）

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@betting-forum/database';
import { PrismaService } from '../common/prisma.service';
import { EconomyService, InsufficientBalanceError } from '../economy/economy.service';
import { OddsPipelineService } from './odds-pipeline.service';
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
}

/** 機器可讀拒單（前端據 code 映射 UI 狀態，規格 §7.3：拒單是狀態不是錯誤） */
function reject(code: string, message: string, status: HttpStatus, data?: unknown): never {
  throw new HttpException({ code, message, data }, status);
}

@Injectable()
export class BetsService {
  private readonly logger = new Logger(BetsService.name);

  constructor(
    private prisma: PrismaService,
    private economy: EconomyService,
    private pipeline: OddsPipelineService,
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

    // ── 檢查 1+2：賽事存在、板塊/玩法有開、未開賽、未進封盤 buffer（交易外先擋一次，交易內再重查）
    const match = await this.prisma.predictionMatch.findUnique({ where: { id: input.matchId } });
    if (!match) reject('MARKET_LOCKED', '賽事不存在', HttpStatus.NOT_FOUND);
    const board = PREDICTION_BOARDS[match.boardSlug];
    if (!board?.enabled || !board.markets.includes(input.market)) {
      reject('MARKET_LOCKED', '此賽事/玩法未開放競猜', HttpStatus.BAD_REQUEST);
    }
    this.assertOpen(match.apiStatus, match.startTime);

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
        where: { matchId: match.id, market: input.market, selection: input.selection, line: lineDecimal, active: true },
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

    // ── 檢查 5a：每日總額上限（防刷關卡 #6）
    const dayStart = new Date();
    dayStart.setUTCHours(dayStart.getUTCHours() - 24);
    const [dailyAgg, exposureAgg] = await Promise.all([
      this.prisma.bet.aggregate({ _sum: { stake: true }, where: { userId, createdAt: { gte: dayStart } } }),
      this.prisma.bet.aggregate({
        _sum: { stake: true },
        where: { userId, matchId: match.id, market: input.market, status: 'PENDING' },
      }),
    ]);
    if ((dailyAgg._sum.stake ?? 0) + input.stake > DAILY_STAKE_CAP) {
      reject('LIMIT_EXCEEDED', '已達每日投注總額上限', HttpStatus.BAD_REQUEST, { cap: DAILY_STAKE_CAP });
    }
    // ── 檢查 5b：單場單市場曝險上限
    if ((exposureAgg._sum.stake ?? 0) + input.stake > MATCH_MARKET_STAKE_CAP) {
      reject('LIMIT_EXCEEDED', '已達此賽事的投注上限', HttpStatus.BAD_REQUEST, { cap: MATCH_MARKET_STAKE_CAP });
    }

    // ── 交易：封盤重查（權威）→ 建注單 → 原子扣款（任一步失敗整批 rollback）
    const lockedOdds = quote.odds;
    const potentialPayout = Math.floor(input.stake * lockedOdds.toNumber());
    try {
      const bet = await this.prisma.$transaction(async (tx) => {
        // 封盤判斷在交易內重查 DB（開賽瞬間臨界競態；cron 可能剛把 status 翻掉）
        const fresh = await tx.predictionMatch.findUniqueOrThrow({
          where: { id: match.id },
          select: { apiStatus: true, startTime: true },
        });
        this.assertOpen(fresh.apiStatus, fresh.startTime);

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
            quoteId: quote.id,
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
      return {
        betId: bet.id,
        lockedOdds: lockedOdds.toNumber(),
        line: bet.line?.toNumber() ?? null,
        stake: bet.stake,
        potentialPayout,
        status: bet.status,
      };
    } catch (e) {
      if (e instanceof InsufficientBalanceError) {
        reject('INSUFFICIENT_BALANCE', 'P 幣餘額不足', HttpStatus.BAD_REQUEST);
      }
      if (e instanceof HttpException) throw e; // 交易內封盤重查的拒單
      throw e;
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
    return bets.map((b) => ({
      betId: b.id,
      board: b.match.boardSlug,
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
    }));
  }

  /** 收單條件：未開賽 + 未進封盤 buffer（規格 §3.2 檢查 1+2；交易內外共用） */
  private assertOpen(apiStatus: string, startTime: Date): void {
    if (apiStatus !== 'NS') reject('MARKET_LOCKED', '賽事已開賽或不可競猜', HttpStatus.CONFLICT);
    if (Date.now() >= startTime.getTime() - LOCK_BUFFER_MS) {
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
