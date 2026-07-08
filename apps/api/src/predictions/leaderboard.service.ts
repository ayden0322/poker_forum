// P幣競猜 — 排行榜（規格 §6，圓桌 T2 定案公式）
// Score = ROI × min(1, √(有效注數/30)) × min(1, √(有效投注額/門檻))
//   - ROI 加權讓「1.05 大熱門刷勝率」變負分（度量問的是「有沒有打贏賠率隱含機率」）
//   - 純勝率降級為輔助三元組顯示（勝率 · 平均賠率 · 注數），透明本身是防禦（design 定案）
// 原始事實都在 bet 表（lockedOdds/settledScore），公式可隨時全量重算——榜可迭代、帳不行。

import { Injectable } from '@nestjs/common';
import { Prisma } from '@betting-forum/database';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { isPredictionEnabled } from './prediction.flags';
import { MatchLinkService } from './match-link.service';

/** 參榜門檻：期間內已結算投注額（後台可調為後續增量） */
const MIN_STAKED = 1_000;
/** shrinkage 基準 */
const N_BASE = 30;
const STAKE_BASE = 5_000;
const CACHE_TTL_SEC = 300;

export interface LeaderboardRow {
  rank: number;
  nickname: string;
  score: number; // 表現分（ROI 加權後 ×100 取一位小數）
  profit: number; // 淨損益（輔助顯示）
  n: number; // 有效注數（已結算勝/負，PUSH 不計）
  winRate: number; // 勝率 %（輔助三元組）
  avgOdds: number; // 平均賠率（輔助三元組）
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

  async top(period: 'week' | 'month'): Promise<{ enabled: boolean; periodStart: string; rows: LeaderboardRow[] }> {
    if (!isPredictionEnabled()) return { enabled: false, periodStart: '', rows: [] };
    const start = periodStart(period);
    const cacheKey = `prediction:leaderboard:${period}:${start.toISOString().slice(0, 10)}`;
    const cached = await this.redis.get<LeaderboardRow[]>(cacheKey);
    if (cached) return { enabled: true, periodStart: start.toISOString(), rows: cached };

    // 期間內已結算注單聚合（PUSH/VOIDED 退本不影響損益，不計入有效注數）
    const rows = await this.prisma.$queryRaw<
      Array<{ nickname: string; n: number; staked: number; profit: number; wins: number; avg_odds: number }>
    >(Prisma.sql`
      SELECT u.nickname,
             COUNT(*) FILTER (WHERE b.status IN ('WON','LOST'))::int AS n,
             COALESCE(SUM(b.stake) FILTER (WHERE b.status IN ('WON','LOST')), 0)::int AS staked,
             COALESCE(SUM(CASE WHEN b.status = 'WON' THEN b.potential_payout - b.stake
                               WHEN b.status = 'LOST' THEN -b.stake ELSE 0 END), 0)::int AS profit,
             COUNT(*) FILTER (WHERE b.status = 'WON')::int AS wins,
             COALESCE(AVG(b.locked_odds) FILTER (WHERE b.status IN ('WON','LOST')), 0)::float AS avg_odds
      FROM bets b
      JOIN users u ON u.id = b.user_id
      WHERE b.settled_at >= ${start} AND b.status IN ('WON','LOST')
      GROUP BY u.id, u.nickname
      HAVING COALESCE(SUM(b.stake) FILTER (WHERE b.status IN ('WON','LOST')), 0) >= ${MIN_STAKED}
    `);

    const scored: LeaderboardRow[] = rows
      .map((r) => {
        const roi = r.staked > 0 ? r.profit / r.staked : 0;
        const score = roi * Math.min(1, Math.sqrt(r.n / N_BASE)) * Math.min(1, Math.sqrt(r.staked / STAKE_BASE));
        return {
          rank: 0,
          nickname: r.nickname,
          score: Math.round(score * 1000) / 10, // ×100 一位小數
          profit: r.profit,
          n: r.n,
          winRate: r.n > 0 ? Math.round((r.wins / r.n) * 1000) / 10 : 0,
          avgOdds: Math.round(r.avg_odds * 100) / 100,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    await this.redis.set(cacheKey, scored, CACHE_TTL_SEC);
    return { enabled: true, periodStart: start.toISOString(), rows: scored };
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
