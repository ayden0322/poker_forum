// P幣競猜 — 排行榜（規格 §6；2026-07-09 定案：獲利榜 + 勝率榜，滿 30 場入榜）
//   - 獲利榜：期間內淨獲利 P 幣排序（增加競爭感，週冠軍發限定稱號）
//   - 勝率榜：勝場 / 已結算場排序；平均賠率同列顯示（透明防「只押大熱門刷勝率」——red-team A 刀）
// 入榜門檻：期間內已結算滿 30 場（勝/負，PUSH/VOIDED 退本不計）。
// 原始事實都在 bet 表，排序邏輯賽後可全量重算——榜可迭代、帳不行。

import { Injectable } from '@nestjs/common';
import { Prisma } from '@betting-forum/database';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { isPredictionEnabled } from './prediction.flags';
import { MatchLinkService } from './match-link.service';

/** 入榜門檻：期間內已結算場次（勝/負）。後台可調為後續增量。 */
export const MIN_SETTLED = 30;
/** 冷啟動軟門檻：開站期從零起步，30 場門檻會讓榜整個月都是空的（圓桌 growth 刀）。 */
export const MIN_SETTLED_SOFT = 10;
/**
 * 冷啟動期截止（台北時間 ISO 字串，例：2026-09-01T00:00:00+08:00）。
 * 未設 = 沒有冷啟動期，一律用正常門檻（fail-safe：寧可榜空，不要永久軟門檻）。
 * go-live 時與 PREDICTION_ENABLED 一起設，通常給「開站後第一個完整賽季結束」。
 */
const SOFT_UNTIL = process.env.HONOR_SOFT_UNTIL ? new Date(process.env.HONOR_SOFT_UNTIL) : null;

/**
 * 該期間的入榜門檻。★ 刻意做成「期間起點的純函式」，不是可變全域常數：
 *   同一期間不論何時重算，門檻都一樣 → 冷啟動期加冕的冠軍不會在軟門檻結束後被回頭踢掉。
 *   這條對齊 honor.service 的鐵律「門檻不得溯及既往」——版本切分靠時間，不靠改常數。
 */
export function minSettledFor(periodStart: Date): number {
  if (!SOFT_UNTIL || Number.isNaN(SOFT_UNTIL.getTime())) return MIN_SETTLED;
  return periodStart < SOFT_UNTIL ? MIN_SETTLED_SOFT : MIN_SETTLED;
}
/** 勝率榜「有效競猜」的最低賠率：低於此的大熱門不計入勝率（防只押 1.05 刷勝率，red-team A 刀） */
export const WINRATE_MIN_ODDS = 1.5;
const CACHE_TTL_SEC = 300;

export type LeaderboardType = 'profit' | 'winrate';

export interface LeaderboardRow {
  rank: number;
  nickname: string;
  profit: number; // 期間淨損益 P 幣（獲利榜主指標）
  winRate: number; // 勝率 %（勝率榜主指標）
  n: number; // 已結算場次（勝/負）
  avgOdds: number; // 平均賠率（勝率榜同列顯示＝透明防刷）
}

/** 台灣時區的期間起點 */
function periodStart(period: 'week' | 'month', now = new Date()): Date {
  // 以台北時間計界（UTC+8，無夏令時間）
  const tpe = new Date(now.getTime() + 8 * 3600_000);
  if (period === 'week') {
    const day = tpe.getUTCDay() || 7; // 週一=1
    const monday = new Date(Date.UTC(tpe.getUTCFullYear(), tpe.getUTCMonth(), tpe.getUTCDate() - (day - 1)));
    return new Date(monday.getTime() - 8 * 3600_000);
  }
  const first = new Date(Date.UTC(tpe.getUTCFullYear(), tpe.getUTCMonth(), 1));
  return new Date(first.getTime() - 8 * 3600_000);
}

@Injectable()
export class LeaderboardService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private matchLink: MatchLinkService,
  ) {}

  async top(
    period: 'week' | 'month',
    type: LeaderboardType = 'profit',
  ): Promise<{ enabled: boolean; periodStart: string; type: LeaderboardType; minSettled: number; rows: LeaderboardRow[] }> {
    if (!isPredictionEnabled()) {
      return { enabled: false, periodStart: '', type, minSettled: MIN_SETTLED, rows: [] };
    }
    const start = periodStart(period);
    // minSettled 據實回報「這個期間實際套用的門檻」，前台照這個數字顯示：
    // 冷啟動軟門檻要讓使用者看得見（≥10 注·開站期），不是偷偷放水。
    const base = { periodStart: '', type, minSettled: minSettledFor(start) };
    const cacheKey = `prediction:leaderboard:${type}:${period}:${start.toISOString().slice(0, 10)}`;
    const cached = await this.redis.get<LeaderboardRow[]>(cacheKey);
    if (cached) return { enabled: true, ...base, periodStart: start.toISOString(), rows: cached };

    const rows = await this.rankForRange(start, null, type);

    await this.redis.set(cacheKey, rows, CACHE_TTL_SEC);
    return { enabled: true, ...base, periodStart: start.toISOString(), rows };
  }

  /** 上週榜首（週冠軍 cron 用）：回 nickname + 指標，達門檻才有；無人達標回 null */
  async championOf(type: LeaderboardType, start: Date, end: Date): Promise<LeaderboardRow | null> {
    const rows = await this.rankForRange(start, end, type);
    return rows[0] ?? null;
  }

  /** 期間內排名前 N（月賽季冠亞季 + 神準射手用）。 */
  async standingsForRange(type: LeaderboardType, start: Date, end: Date, limit = 3): Promise<LeaderboardRow[]> {
    const rows = await this.rankForRange(start, end, type);
    return rows.slice(0, limit);
  }

  /** 影響力榜（二期）：期間內「被跟單」數（每人每單已去重），依被跟單擁有者排序。end=null 到現在。 */
  async influenceRanking(start: Date, end: Date | null, limit = 20): Promise<Array<{ rank: number; nickname: string; follows: number }>> {
    const endCond = end ? Prisma.sql`AND pf.created_at < ${end}` : Prisma.empty;
    const raw = await this.prisma.$queryRaw<Array<{ nickname: string; follows: number }>>(Prisma.sql`
      SELECT owner.nickname, COUNT(*)::int AS follows
      FROM pick_follows pf
      JOIN bets pb ON pb.id = pf.pick_bet_id
      JOIN users owner ON owner.id = pb.user_id
      WHERE pf.created_at >= ${start} ${endCond}
      GROUP BY owner.id, owner.nickname
      ORDER BY follows DESC
      LIMIT ${limit}
    `);
    return raw.map((r, i) => ({ rank: i + 1, nickname: r.nickname, follows: r.follows }));
  }

  /**
   * 共用聚合排名：[start, end) 期間內已結算注單。end=null 表示到現在。
   * 獲利榜：全部勝負注；勝率榜：只計賠率 ≥1.5 的「有效競猜」（防只押大熱門刷勝率）。
   */
  private async rankForRange(start: Date, end: Date | null, type: LeaderboardType): Promise<LeaderboardRow[]> {
    const endCond = end ? Prisma.sql`AND b.settled_at < ${end}` : Prisma.empty;
    const raw = await this.prisma.$queryRaw<
      Array<{ nickname: string; n: number; profit: number; qn: number; qwins: number; q_avg_odds: number }>
    >(Prisma.sql`
      SELECT u.nickname,
             COUNT(*) FILTER (WHERE b.status IN ('WON','LOST'))::int AS n,
             COALESCE(SUM(CASE WHEN b.status = 'WON' THEN b.potential_payout - b.stake
                               WHEN b.status = 'LOST' THEN -b.stake ELSE 0 END), 0)::int AS profit,
             COUNT(*) FILTER (WHERE b.status IN ('WON','LOST') AND b.locked_odds >= ${WINRATE_MIN_ODDS})::int AS qn,
             COUNT(*) FILTER (WHERE b.status = 'WON' AND b.locked_odds >= ${WINRATE_MIN_ODDS})::int AS qwins,
             COALESCE(AVG(b.locked_odds) FILTER (WHERE b.status IN ('WON','LOST') AND b.locked_odds >= ${WINRATE_MIN_ODDS}), 0)::float AS q_avg_odds
      FROM bets b
      JOIN users u ON u.id = b.user_id
      WHERE b.settled_at >= ${start} ${endCond} AND b.status IN ('WON','LOST')
      GROUP BY u.id, u.nickname
    `);

    // 依榜別各自套門檻：獲利榜看總場數 n；勝率榜看「有效競猜」場數 qn。
    // 門檻依「期間起點」決定（冷啟動期 10、之後 30），確保重算結果穩定、不溯及既往。
    const threshold = minSettledFor(start);
    const mapped = raw
      .filter((r) => (type === 'winrate' ? r.qn : r.n) >= threshold)
      .map((r) => ({
        rank: 0,
        nickname: r.nickname,
        profit: r.profit,
        winRate: r.qn > 0 ? Math.round((r.qwins / r.qn) * 1000) / 10 : 0,
        n: type === 'winrate' ? r.qn : r.n,
        avgOdds: Math.round(r.q_avg_odds * 100) / 100,
      }));
    mapped.sort((a, b) =>
      type === 'winrate' ? b.winRate - a.winRate || b.n - a.n : b.profit - a.profit || b.n - a.n,
    );
    return mapped.slice(0, 20).map((r, i) => ({ ...r, rank: i + 1 }));
  }

  /**
   * 公開戰績頁（規格 §8）：三元組統計 + 近期注單。
   * 卡面主角是「立場與命中」——不回傳投注額與獲利數字（design 定案：曬的是預測不是錢）。
   */
  async publicRecord(nickname: string) {
    if (!isPredictionEnabled()) return { enabled: false as const };
    const user = await this.prisma.user.findUnique({ where: { nickname }, select: { id: true, nickname: true } });
    if (!user) return { enabled: true as const, found: false as const };

    const [agg] = await this.prisma.$queryRaw<
      Array<{ n: number; wins: number; avg_odds: number; pushes: number }>
    >(Prisma.sql`
      SELECT COUNT(*) FILTER (WHERE status IN ('WON','LOST'))::int AS n,
             COUNT(*) FILTER (WHERE status = 'WON')::int AS wins,
             COALESCE(AVG(locked_odds) FILTER (WHERE status IN ('WON','LOST')), 0)::float AS avg_odds,
             COUNT(*) FILTER (WHERE status = 'PUSH')::int AS pushes
      FROM bets WHERE user_id = ${user.id}
    `);

    const betSelect = {
      id: true,
      market: true, selection: true, line: true, lockedOdds: true, status: true, settledAt: true,
      match: { select: { boardSlug: true, homeName: true, awayName: true, startTime: true } },
    } as const;
    const [recent, pending] = await Promise.all([
      this.prisma.bet.findMany({
        where: { userId: user.id, status: { in: ['WON', 'LOST', 'PUSH'] } },
        orderBy: { settledAt: 'desc' },
        take: 10,
        select: betSelect,
      }),
      // 進行中（賽前公開曬單=社會證明，圓桌 growth 定案；一樣不含金額）
      this.prisma.bet.findMany({
        where: { userId: user.id, status: 'PENDING' },
        orderBy: { match: { startTime: 'asc' } },
        take: 10,
        select: betSelect,
      }),
    ]);

    return {
      enabled: true as const,
      found: true as const,
      nickname: user.nickname,
      stats: {
        n: agg?.n ?? 0,
        winRate: agg && agg.n > 0 ? Math.round((agg.wins / agg.n) * 1000) / 10 : 0,
        avgOdds: agg ? Math.round(agg.avg_odds * 100) / 100 : 0,
      },
      pending: await Promise.all(pending.map((b) => this.toRecordBet(b))),
      recent: await Promise.all(recent.map((b) => this.toRecordBet(b))),
    };
  }

  private async toRecordBet(b: {
    id: string; market: string; selection: string; line: Prisma.Decimal | null; lockedOdds: Prisma.Decimal; status: string;
    match: { boardSlug: string; homeName: string; awayName: string; startTime: Date };
  }) {
    return {
      id: b.id,
      board: b.match.boardSlug,
      detailUrl: await this.matchLink.detailUrl(b.match.boardSlug, b.match.homeName, b.match.startTime),
      home: b.match.homeName,
      away: b.match.awayName,
      startTime: b.match.startTime,
      market: b.market,
      selection: b.selection,
      line: b.line?.toNumber() ?? null,
      lockedOdds: b.lockedOdds.toNumber(),
      status: b.status,
    };
  }
}
