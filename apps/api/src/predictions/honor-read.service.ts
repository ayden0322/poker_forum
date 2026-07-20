// 榮譽系統 — 讀取面（排行榜 / 在位冠軍 / 名人堂）。給 /honor 頁用。
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { LeaderboardService } from './leaderboard.service';

@Injectable()
export class HonorReadService {
  constructor(
    private prisma: PrismaService,
    private leaderboard: LeaderboardService,
  ) {}

  async overview() {
    const now = new Date();
    const [accuracy, profit, reigns, hof] = await Promise.all([
      this.leaderboard.top('month', 'winrate'),
      this.leaderboard.top('month', 'profit'),
      this.prisma.championReign.findMany({
        where: { reignFrom: { lte: now }, reignTo: { gt: now } },
        include: { user: { select: { nickname: true, avatar: true } } },
      }),
      this.prisma.hallOfFameRecord.findMany({
        where: { isCurrent: true },
        include: { user: { select: { nickname: true } } },
        orderBy: { recordType: 'asc' },
      }),
    ]);
    const influence = accuracy.periodStart
      ? await this.leaderboard.influenceRanking(new Date(accuracy.periodStart), null, 10)
      : [];

    // 近期加冕/榮耀動態（加冕 feed）
    const [recentReigns, recentAwards] = await Promise.all([
      this.prisma.championReign.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { user: { select: { nickname: true } } } }),
      this.prisma.honorAward.findMany({
        where: { code: { in: ['LEGEND_STRIKE', 'STREAK_20', 'INFLUENCE_10000', 'UPSET_HUNTER', 'STREAK_10'] } },
        orderBy: { awardedAt: 'desc' },
        take: 6,
        include: { user: { select: { nickname: true } } },
      }),
    ]);
    const AWARD_LABEL: Record<string, string> = {
      LEGEND_STRIKE: '一戰封神', STREAK_20: '二十連勝', STREAK_10: '十連勝之王', UPSET_HUNTER: '冷門獵人', INFLUENCE_10000: '影響力王',
    };
    const BOARD_LABEL: Record<string, string> = { ACCURACY: '神算王', PROFIT: '獲利王', INFLUENCE: '人氣王' };
    const events = [
      ...recentReigns.map((r) => ({ kind: 'crown' as const, nickname: r.user.nickname, label: `登頂本季${BOARD_LABEL[r.board] ?? r.board}`, at: r.createdAt })),
      ...recentAwards.map((a) => ({ kind: 'award' as const, nickname: a.user.nickname, label: `達成 ${AWARD_LABEL[a.code] ?? a.code}`, at: a.awardedAt })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 6);

    return {
      enabled: accuracy.enabled,
      periodStart: accuracy.periodStart,
      minSettled: accuracy.minSettled, // 冷啟動期會是軟門檻（10），前台照實顯示不寫死
      accuracy: accuracy.rows,
      profit: profit.rows,
      influence,
      events,
      champions: reigns.map((r) => ({ board: r.board, nickname: r.user.nickname, avatar: r.user.avatar, reignTo: r.reignTo })),
      hallOfFame: hof.map((h) => ({
        recordType: h.recordType,
        nickname: h.user.nickname,
        value: h.value,
        context: h.context,
        achievedAt: h.achievedAt,
      })),
    };
  }

  /** 榮耀圖鑑：全部榮耀徽章（買不到）+ 條件 + 擁有率（稀有度）。 */
  async catalog() {
    const RARITY_ORDER: Record<string, number> = { LEGENDARY: 0, RARE: 1, COMMON: 2 };
    const [items, totalUsers] = await Promise.all([
      this.prisma.cosmeticItem.findMany({
        where: { type: 'BADGE', purchasable: false, enabled: true },
        select: { name: true, description: true, assetUrl: true, rarity: true, _count: { select: { userCosmetics: true } } },
      }),
      this.prisma.user.count(),
    ]);
    return items
      .map((i) => ({
        name: i.name,
        description: i.description,
        assetUrl: i.assetUrl,
        rarity: i.rarity,
        owned: i._count.userCosmetics,
        pct: totalUsers > 0 ? Math.round((i._count.userCosmetics / totalUsers) * 1000) / 10 : 0,
      }))
      .sort((a, b) => (RARITY_ORDER[a.rarity] ?? 3) - (RARITY_ORDER[b.rarity] ?? 3) || a.pct - b.pct);
  }

  /** 我的榮耀：個人排名 + 下一個成就進度 + 收集度（登入者用）。 */
  async myHonor(userId: string) {
    const now = new Date();
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } });
    if (!user) return null;

    const [stat, ownedBadges, totalBadges, reign, awards, followRows, accBoard, profBoard] = await Promise.all([
      this.prisma.userBettingStat.findUnique({ where: { userId } }),
      this.prisma.userCosmetic.count({ where: { userId, item: { type: 'BADGE', purchasable: false } } }),
      this.prisma.cosmeticItem.count({ where: { type: 'BADGE', purchasable: false, enabled: true } }),
      this.prisma.championReign.findFirst({ where: { userId, reignFrom: { lte: now }, reignTo: { gt: now } }, select: { board: true } }),
      this.prisma.honorAward.count({ where: { userId } }),
      this.prisma.$queryRaw<Array<{ c: number }>>`SELECT COUNT(*)::int AS c FROM pick_follows pf JOIN bets b ON b.id = pf.pick_bet_id WHERE b.user_id = ${userId}`,
      this.leaderboard.top('month', 'winrate'),
      this.leaderboard.top('month', 'profit'),
    ]);
    const followed = followRows[0]?.c ?? 0;
    const inflRows = accBoard.periodStart ? await this.leaderboard.influenceRanking(new Date(accBoard.periodStart), null, 100) : [];

    const rankIn = (rows: Array<{ nickname: string; rank: number }>) => rows.find((r) => r.nickname === user.nickname)?.rank ?? null;
    const nextTier = (v: number, tiers: number[]) => tiers.find((t) => v < t) ?? null;
    const bestStreak = stat?.bestStreak ?? 0;
    const streakTarget = nextTier(bestStreak, [5, 10, 20]);
    const inflTarget = nextTier(followed, [100, 1000, 10000]);

    return {
      nickname: user.nickname,
      currentStreak: stat?.currentStreak ?? 0,
      bestStreak,
      followedCount: followed,
      awards,
      reign: reign?.board ?? null,
      collection: { owned: ownedBadges, total: totalBadges },
      ranks: {
        accuracy: rankIn(accBoard.rows),
        profit: rankIn(profBoard.rows),
        influence: inflRows.find((r) => r.nickname === user.nickname)?.rank ?? null,
      },
      next: {
        streak: streakTarget ? { label: `${streakTarget} 連勝`, current: bestStreak, target: streakTarget } : null,
        influence: inflTarget ? { label: `帶單 ${inflTarget.toLocaleString()}`, current: followed, target: inflTarget } : null,
      },
    };
  }
}
