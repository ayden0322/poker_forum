// P幣競猜 — 結算（規格 §4）
// 冪等三件套：
//   1. 樂觀鎖狀態轉移：tx 內 updateMany({ where: { id, status: 'PENDING' } })，affected=0 就 skip
//   2. ledger 冪等鍵：bet_payout:{betId} / bet_refund:{betId}（DB @unique 擋雙重派彩）
//   3. 狀態轉移與入帳同一 transaction：任一步失敗整批 rollback
// 政策（規格 §4.3）：
//   - FINAL → 等 grace period（吃比分更正窗）才結算；grace 期間每輪同步刷新 finalScore
//   - VOID（取消/腰斬/技術判定）→ 立即全額退款
//   - FREEZE（延賽/中斷）→ 凍結；期滿仍未恢復或確認改日（回 NS）→ 全額退款
//   - UNKNOWN status → 不動作 + error log 告警

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@betting-forum/database';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { EconomyService } from '../economy/economy.service';
import { classifyStatus, decideOutcome, Outcome } from './settlement-rules';
import {
  PredictionBoardConfig,
  POSTPONE_FREEZE_MS,
  QUOTA_KEY_PREFIX,
  SETTLE_GRACE_MS,
} from './prediction.config';

interface ApiEnvelope<T> {
  response: T;
  errors?: Record<string, string> | unknown[];
}

type MatchRow = {
  id: string;
  boardSlug: string;
  sportType: string;
  apiFixtureId: number;
  apiStatus: string;
  startTime: Date;
  frozenAt: Date | null;
  finishedAt: Date | null;
  finalScore: Prisma.JsonValue;
};

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);
  private readonly apiKey: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private redis: RedisService,
    private economy: EconomyService,
  ) {
    this.apiKey = this.config.get<string>('API_SPORTS_KEY', '');
  }

  /** 跑一輪：賽果同步 + 到期結算。回傳 API 呼叫數。 */
  async runRound(board: PredictionBoardConfig): Promise<number> {
    let calls = 0;
    try {
      calls += await this.syncResults(board);
      await this.settleDue(board);
      if (calls > 0) await this.bumpQuota(board.apiHost, calls);
    } catch (err) {
      this.logger.error(`結算輪失敗（${board.boardSlug}）：${err}`);
    }
    return calls;
  }

  // ===== 賽果同步：已開打且未結算的場次 → 刷新 status / 比分 =====

  private async syncResults(board: PredictionBoardConfig): Promise<number> {
    const pending = await this.prisma.predictionMatch.findMany({
      where: { boardSlug: board.boardSlug, settledAt: null, startTime: { lte: new Date() } },
      select: { id: true, apiFixtureId: true, apiStatus: true, startTime: true, frozenAt: true, finishedAt: true },
    });
    if (pending.length === 0) return 0;

    let calls = 0;
    const byFixtureId = new Map(pending.map((m) => [m.apiFixtureId, m]));

    if (board.sportType === 'football') {
      // /fixtures?ids=a-b-c（單次最多 20 筆）
      const ids = [...byFixtureId.keys()];
      for (let i = 0; i < ids.length; i += 20) {
        const chunk = ids.slice(i, i + 20);
        const data = await this.callApiRaw<any[]>(board.apiHost, '/fixtures', { ids: chunk.join('-') });
        calls++;
        for (const item of data?.response ?? []) {
          const m = byFixtureId.get(item.fixture?.id);
          if (!m) continue;
          // 1X2/大小分以 90 分鐘比分結算：優先 score.fulltime，缺才退 goals
          const home = item.score?.fulltime?.home ?? item.goals?.home ?? null;
          const away = item.score?.fulltime?.away ?? item.goals?.away ?? null;
          await this.applySync(board, m, item.fixture?.status?.short, home, away, item.fixture?.date);
        }
      }
    } else {
      // baseball：無批次 ids，改按日期撈（一天一呼叫，通常 1-2 天）
      const dates = [...new Set(pending.map((m) => m.startTime.toISOString().slice(0, 10)))];
      for (const date of dates) {
        const data = await this.callApiRaw<any[]>(board.apiHost, '/games', {
          league: board.leagueId,
          season: board.season,
          date,
        });
        calls++;
        for (const item of data?.response ?? []) {
          const m = byFixtureId.get(item.id);
          if (!m) continue;
          await this.applySync(board, m, item.status?.short, item.scores?.home?.total ?? null, item.scores?.away?.total ?? null, item.date);
        }
      }
    }
    if (calls) this.logger.log(`賽果同步（${board.boardSlug}）：${pending.length} 場待結、${calls} 次呼叫`);
    return calls;
  }

  /** 套用單場同步結果：status 轉移 + 比分 + finishedAt/frozenAt 時間戳 */
  private async applySync(
    board: PredictionBoardConfig,
    m: { id: string; apiStatus: string; frozenAt: Date | null; finishedAt: Date | null },
    newStatus: string | undefined,
    home: number | null,
    away: number | null,
    newDate: string | undefined,
  ): Promise<void> {
    if (!newStatus) return;
    const cls = classifyStatus(board.sportType, newStatus);
    if (cls === 'UNKNOWN') {
      // 白名單外：不動作 + 告警（絕不 default 當完賽結掉）
      this.logger.error(`⚠️ 未知賽況 status=${newStatus}（${board.boardSlug} match=${m.id}），不動作，請人工確認`);
      return;
    }

    const data: Prisma.PredictionMatchUpdateInput = { apiStatus: newStatus };
    if (newDate) data.startTime = new Date(newDate); // 延賽改期會更新開賽時間
    if (cls === 'FINAL' && home !== null && away !== null) {
      data.finalScore = { home, away }; // grace 期間每輪刷新（吃比分更正）
      if (!m.finishedAt) data.finishedAt = new Date(); // 首次觀測到完賽才蓋章，grace 從此起算
    }
    if (cls === 'FREEZE' && !m.frozenAt) data.frozenAt = new Date();
    // 恢復比賽（FREEZE → 進行中/完賽）：解除凍結；注意「回 NS」不解除（那是改日，交給結算輪退款）
    if (m.frozenAt && (cls === 'FINAL' || (cls === 'WAIT' && newStatus !== 'NS'))) data.frozenAt = null;

    await this.prisma.predictionMatch.update({ where: { id: m.id }, data });
  }

  // ===== 到期結算 =====

  private async settleDue(board: PredictionBoardConfig): Promise<void> {
    const now = Date.now();
    const candidates = (await this.prisma.predictionMatch.findMany({
      where: { boardSlug: board.boardSlug, settledAt: null, startTime: { lte: new Date() } },
    })) as MatchRow[];

    for (const m of candidates) {
      const cls = classifyStatus(board.sportType, m.apiStatus);
      try {
        if (cls === 'VOID') {
          await this.voidMatch(m, `賽況 ${m.apiStatus}`);
        } else if (cls === 'FREEZE' && m.frozenAt && now - m.frozenAt.getTime() >= POSTPONE_FREEZE_MS) {
          await this.voidMatch(m, `凍結期滿仍 ${m.apiStatus}`);
        } else if (cls === 'WAIT' && m.apiStatus === 'NS' && m.frozenAt) {
          await this.voidMatch(m, '延賽後確認改日'); // 規格 §4.3：確認改期 → 退款
        } else if (cls === 'FINAL' && m.finishedAt && now - m.finishedAt.getTime() >= SETTLE_GRACE_MS) {
          await this.settleMatch(m);
        }
      } catch (err) {
        this.logger.error(`結算失敗（match=${m.id}）：${err}`);
      }
    }
  }

  /** 完賽結算：逐注判定 → 樂觀鎖轉移 + 派彩/退款同 tx */
  private async settleMatch(m: MatchRow): Promise<void> {
    const score = m.finalScore as { home: number; away: number } | null;
    if (!score || typeof score.home !== 'number' || typeof score.away !== 'number') {
      this.logger.error(`⚠️ 完賽但無有效比分（match=${m.id}），不結算，請人工確認`);
      return;
    }
    const bets = await this.prisma.bet.findMany({ where: { matchId: m.id, status: 'PENDING' } });
    let settled = 0;
    const tally: Record<Outcome, number> = { WON: 0, LOST: 0, PUSH: 0 };

    for (const bet of bets) {
      const outcome = decideOutcome(
        m.sportType as 'football' | 'baseball',
        bet.market,
        bet.selection,
        bet.line?.toNumber() ?? null,
        score.home,
        score.away,
      );
      const ok = await this.transitionAndPay(bet.id, bet.userId, outcome, {
        payout: bet.potentialPayout,
        stake: bet.stake,
        settledScore: score,
      });
      if (ok) {
        settled++;
        tally[outcome]++;
      }
    }
    await this.markMatchSettled(m.id);
    this.logger.log(
      `結算完成（${m.boardSlug} match=${m.id} ${score.home}:${score.away}）：` +
        `${settled}/${bets.length} 注（贏 ${tally.WON}／輸 ${tally.LOST}／平 ${tally.PUSH}）`,
    );
  }

  /** 退款作廢（取消/凍結期滿/改日）：全部 PENDING 注單 → VOIDED + 退本金 */
  private async voidMatch(m: MatchRow, why: string): Promise<void> {
    const bets = await this.prisma.bet.findMany({ where: { matchId: m.id, status: 'PENDING' } });
    let voided = 0;
    for (const bet of bets) {
      const ok = await this.transitionAndPay(bet.id, bet.userId, 'VOIDED', {
        payout: 0,
        stake: bet.stake,
        settledScore: null,
      });
      if (ok) voided++;
    }
    await this.markMatchSettled(m.id);
    this.logger.warn(`賽事作廢退款（${m.boardSlug} match=${m.id}，${why}）：退 ${voided}/${bets.length} 注`);
  }

  /**
   * 單注冪等結算：樂觀鎖狀態轉移 + 入帳同一 transaction。
   * 回傳 false = 已被其他程序結算（affected=0 skip），不是錯誤。
   */
  private async transitionAndPay(
    betId: string,
    userId: string,
    outcome: Outcome | 'VOIDED',
    ctx: { payout: number; stake: number; settledScore: { home: number; away: number } | null },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.bet.updateMany({
        where: { id: betId, status: 'PENDING' }, // 樂觀鎖：單向轉移，重跑/併發自動 skip
        data: {
          status: outcome,
          settledScore: ctx.settledScore ?? Prisma.JsonNull,
          settledAt: new Date(),
        },
      });
      if (res.count === 0) return false;

      if (outcome === 'WON') {
        await this.economy.creditInTx(tx, {
          userId,
          currency: 'P',
          amount: ctx.payout,
          reason: 'PREDICTION_PAYOUT',
          refType: 'bet',
          refId: betId,
          idempotencyKey: `bet_payout:${betId}`,
        });
      } else if (outcome === 'PUSH' || outcome === 'VOIDED') {
        await this.economy.creditInTx(tx, {
          userId,
          currency: 'P',
          amount: ctx.stake,
          reason: 'PREDICTION_REFUND',
          refType: 'bet',
          refId: betId,
          idempotencyKey: `bet_refund:${betId}`,
        });
      }
      // LOST：本金已於下注時扣除，不入帳
      return true;
    });
  }

  /** 該場已無 PENDING 注單 → 蓋結算完成章（之後結算輪不再掃它） */
  private async markMatchSettled(matchId: string): Promise<void> {
    const remaining = await this.prisma.bet.count({ where: { matchId, status: 'PENDING' } });
    if (remaining === 0) {
      await this.prisma.predictionMatch.update({
        where: { id: matchId },
        data: { settledAt: new Date(), frozenAt: null },
      });
    }
  }

  // ===== API 呼叫 / 額度（沿用 pipeline 慣例） =====

  private async callApiRaw<T>(
    host: string,
    endpoint: string,
    params: Record<string, string | number>,
  ): Promise<ApiEnvelope<T> | null> {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) query.set(k, String(v));
    try {
      const res = await fetch(`https://${host}${endpoint}?${query.toString()}`, {
        headers: { 'x-apisports-key': this.apiKey },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        this.logger.error(`API-Sports 回傳 ${res.status}（${endpoint}）`);
        return null;
      }
      return (await res.json()) as ApiEnvelope<T>;
    } catch (err) {
      this.logger.error(`API-Sports 呼叫失敗（${endpoint}）：${err}`);
      return null;
    }
  }

  private async bumpQuota(host: string, calls: number): Promise<void> {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await this.redis.incrWithTtl(`${QUOTA_KEY_PREFIX}:${host}:${d}`, 26 * 60 * 60, calls);
  }
}
