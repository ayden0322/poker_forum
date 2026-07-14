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

    return {
      enabled: accuracy.enabled,
      periodStart: accuracy.periodStart,
      accuracy: accuracy.rows,
      profit: profit.rows,
      influence,
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
}
