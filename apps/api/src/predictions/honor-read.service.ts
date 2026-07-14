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
}
