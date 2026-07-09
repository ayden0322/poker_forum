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
    const base = { periodStart: '', type, minSettled: MIN_SETTLED };
    if (!isPredictionEnabled()) return { enabled: false, ...base, rows: [] };
    const start = periodStart(period);
    const cacheKey = `prediction:leaderboard:${type}:${period}:${start.toISOString().slice(0, 10)}`;
    const cached = await this.redis.get<LeaderboardRow[]>(cacheKey);
    if (cached) return { enabled: true, ...base, periodStart: start.toISOString(), rows: cached };

    // 期間內已結算注單聚合（PUSH/VOIDED 退本不影響損益、不計入場次）
    const raw = await this.prisma.$queryRaw<
      Array<{ nickname: string; n: number; profit: number; wins: number; avg_odds: number }>
    >(Prisma.sql`
      SELECT u.nickname,
             COUNT(*) FILTER (WHERE b.status IN ('WON','LOST'))::int AS n,
             COALESCE(SUM(CASE WHEN b.status = 'WON' THEN b.potential_payout - b.stake
                               WHEN b.status = 'LOST' THEN -b.stake ELSE 0 END), 0)::int AS profit,
             COUNT(*) FILTER (WHERE b.status = 'WON')::int AS wins,
             COALESCE(AVG(b.locked_odds) FILTER (WHERE b.status IN ('WON','LOST')), 0)::float AS avg_odds
      FROM bets b
      JOIN users u ON u.id = b.user_id
      WHERE b.settled_at >= ${start} AND b.status IN ('WON','LOST')
      GROUP BY u.id, u.nickname
      HAVING COUNT(*) FILTER (WHERE b.status IN ('WON','LOST')) >= ${MIN_SETTLED}
    `);

    const mapped = raw.map((r) => ({
      rank: 0,
      nickname: r.nickname,
      profit: r.profit,
      winRate: r.n > 0 ? Math.round((r.wins / r.n) * 1000) / 10 : 0,
      n: r.n,
      avgOdds: Math.round(r.avg_odds * 100) / 100,
    }));

    // 獲利榜：淨獲利降序（同分場次多者優先）
    // 勝率榜：勝率降序（同率場次多者優先＝樣本更可信）
    mapped.sort((a, b) =>
      type === 'winrate' ? b.winRate - a.winRate || b.n - a.n : b.profit - a.profit || b.n - a.n,
    );
    const rows: LeaderboardRow[] = mapped.slice(0, 20).map((r, i) => ({ ...r, rank: i + 1 }));

    await this.redis.set(cacheKey, rows, CACHE_TTL_SEC);
    return { enabled: true, ...base, periodStart: start.toISOString(), rows };
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
    market: string; selection: string; line: Prisma.Decimal | null; lockedOdds: Prisma.Decimal; status: string;
    match: { boardSlug: string; homeName: string; awayName: string; startTime: Date };
  }) {
    return {
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
