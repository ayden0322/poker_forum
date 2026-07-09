// P幣競猜 — 週冠軍發放（2026-07-09 定案）
// 每週結算，獲利榜/勝率榜各一位冠軍，各發：
//   - 臨時稱號（TITLE）：自動掛上名字旁（displace 當前稱號），7 天到期自動失效（序列化層濾除）
//   - 永久紀念勳章（BADGE）：收藏品，只發一次（已擁有則跳過）
// 冠軍品項由 seed 建立（見 seed-champion-cosmetics.ts）；本 service 依名稱查找後發放。

import { Injectable, Logger } from '@nestjs/common';
import { LeaderboardType, LeaderboardService } from './leaderboard.service';
import { PrismaService } from '../common/prisma.service';

/** 冠軍品項（TITLE + BADGE）依名稱對應，seed 需建立同名品項 */
export const CHAMPION_COSMETICS: Record<LeaderboardType, { title: string; badge: string }> = {
  profit: { title: '本週獲利王', badge: '獲利榜冠軍' },
  winrate: { title: '本週神算子', badge: '勝率榜冠軍' },
};

const TITLE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class ChampionService {
  private readonly logger = new Logger(ChampionService.name);

  constructor(
    private prisma: PrismaService,
    private leaderboard: LeaderboardService,
  ) {}

  /** 計算「上一個台北週」的區間 [start, end)（週一 00:00 台北 為界） */
  static lastWeekRange(now: Date): { start: Date; end: Date; weekLabel: string } {
    const tpe = new Date(now.getTime() + 8 * 3600_000);
    const day = tpe.getUTCDay() || 7; // 週一=1
    const thisMonday = new Date(Date.UTC(tpe.getUTCFullYear(), tpe.getUTCMonth(), tpe.getUTCDate() - (day - 1)));
    const end = new Date(thisMonday.getTime() - 8 * 3600_000); // 本週一 00:00 台北（=上週結束）
    const start = new Date(end.getTime() - 7 * 24 * 3600_000); // 上週一 00:00 台北
    // ISO 週數標籤（W## 用；以上週的週四定年，簡化用上週一日期）
    const wk = isoWeek(new Date(start.getTime() + 8 * 3600_000));
    return { start, end, weekLabel: `W${wk}` };
  }

  /** 發放上週兩榜冠軍。回傳實際發出的冠軍清單（無人達門檻則空）。 */
  async grantWeeklyChampions(now = new Date()): Promise<Array<{ type: LeaderboardType; nickname: string; weekLabel: string }>> {
    const { start, end, weekLabel } = ChampionService.lastWeekRange(now);
    const granted: Array<{ type: LeaderboardType; nickname: string; weekLabel: string }> = [];

    for (const type of ['profit', 'winrate'] as LeaderboardType[]) {
      const champ = await this.leaderboard.championOf(type, start, end);
      if (!champ) {
        this.logger.log(`${weekLabel} ${type} 榜無人達 30 場門檻，不發冠軍`);
        continue;
      }
      try {
        await this.grantTo(type, champ.nickname, weekLabel, new Date(now.getTime() + TITLE_DURATION_MS));
        granted.push({ type, nickname: champ.nickname, weekLabel });
        this.logger.log(`${weekLabel} ${type} 榜冠軍：${champ.nickname}（發稱號+勳章）`);
      } catch (err) {
        this.logger.error(`${weekLabel} ${type} 冠軍發放失敗（${champ.nickname}）：${err}`);
      }
    }
    return granted;
  }

  /** 發給單一冠軍：TITLE（自動掛上、到期）+ BADGE（永久、發一次） */
  private async grantTo(type: LeaderboardType, nickname: string, weekLabel: string, expiresAt: Date): Promise<void> {
    const names = CHAMPION_COSMETICS[type];
    const user = await this.prisma.user.findUnique({ where: { nickname }, select: { id: true } });
    if (!user) throw new Error(`冠軍使用者不存在：${nickname}`);

    const [titleItem, badgeItem] = await Promise.all([
      this.prisma.cosmeticItem.findFirst({ where: { name: names.title, type: 'TITLE' }, select: { id: true } }),
      this.prisma.cosmeticItem.findFirst({ where: { name: names.badge, type: 'BADGE' }, select: { id: true } }),
    ]);
    if (!titleItem || !badgeItem) throw new Error(`冠軍品項未 seed：${names.title}/${names.badge}`);

    await this.prisma.$transaction(async (tx) => {
      // TITLE：自動掛上（先清當前 TITLE 槽）→ upsert 擁有並設 expiresAt + 裝備
      await tx.userCosmetic.updateMany({ where: { userId: user.id, equippedSlot: 'TITLE' }, data: { equippedSlot: null } });
      await tx.userCosmetic.upsert({
        where: { userId_itemId: { userId: user.id, itemId: titleItem.id } },
        create: { userId: user.id, itemId: titleItem.id, source: 'EVENT', equippedSlot: 'TITLE', expiresAt },
        update: { equippedSlot: 'TITLE', expiresAt }, // 連莊：延長到期並重新掛上
      });

      // BADGE：永久，只發一次（已擁有則不動）
      const ownedBadge = await tx.userCosmetic.findUnique({
        where: { userId_itemId: { userId: user.id, itemId: badgeItem.id } },
        select: { id: true },
      });
      if (!ownedBadge) {
        await tx.userCosmetic.create({ data: { userId: user.id, itemId: badgeItem.id, source: 'EVENT' } });
      }
    });
  }
}

/** ISO 週數（1..53） */
function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
