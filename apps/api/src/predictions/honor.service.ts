// 榮譽系統 — 結算時的「連勝 / 命中」成就（2026-07）
// 設計：冪等。每次相關使用者有注結算後，直接由 bet 歷史「重算」連勝與最大命中賠率，
//       跨過門檻就頒發 HonorAward（永久，不重複）+ 發對應成就徽章（CosmeticItem，買不到）+ 更新名人堂。
// 不在結算 transaction 內做（榮耀是次要，失敗不可影響派彩）；由 settlement.service 結完場後 best-effort 呼叫。

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@betting-forum/database';
import { PrismaService } from '../common/prisma.service';
import { WINRATE_MIN_ODDS } from './leaderboard.service';

/** 榮耀計入的最低注額門檻（防 1 幣刷）。上線後依 P 幣經濟規模校準。 */
export const HONOR_MIN_STAKE = Number(process.env.HONOR_MIN_STAKE ?? 100);

/** 連勝成就：bestStreak 跨過門檻即永久擁有 */
const STREAK_ACHIEVEMENTS = [
  { code: 'STREAK_5', badge: '五連勝', n: 5 },
  { code: 'STREAK_10', badge: '十連勝之王', n: 10 },
  { code: 'STREAK_20', badge: '二十連勝', n: 20 },
] as const;

/** 命中成就：任一 WON 注（注額達門檻）的鎖定賠率跨過門檻即永久擁有 */
const UPSET_ACHIEVEMENTS = [
  { code: 'UPSET_HUNTER', badge: '冷門獵人', minOdds: 5 },
  { code: 'LEGEND_STRIKE', badge: '一戰封神', minOdds: 15 },
] as const;

/** 帶單/影響力成就：累計被跟單數跨過門檻即永久擁有（二期） */
const FOLLOW_ACHIEVEMENTS = [
  { code: 'INFLUENCE_100', badge: '帶單百人', n: 100 },
  { code: 'INFLUENCE_1000', badge: '帶單導師', n: 1000 },
  { code: 'INFLUENCE_10000', badge: '影響力王', n: 10000 },
] as const;

@Injectable()
export class HonorService {
  private readonly logger = new Logger(HonorService.name);

  constructor(private prisma: PrismaService) {}

  /** 一場賽事結算後，對其中有注的使用者重算成就（best-effort，逐一 try/catch）。 */
  async onMatchSettled(userIds: string[]): Promise<void> {
    for (const userId of Array.from(new Set(userIds))) {
      try {
        await this.recomputeForUser(userId);
      } catch (err) {
        this.logger.error(`榮耀重算失敗 user=${userId}：${err}`);
      }
    }
  }

  /** 由 bet 歷史冪等重算單一使用者的連勝與命中成就。 */
  async recomputeForUser(userId: string): Promise<void> {
    // 合格注：WON/LOST、賠率 ≥1.5、注額達門檻；PUSH/VOIDED 略過（不中斷連勝）。
    const bets = await this.prisma.bet.findMany({
      where: {
        userId,
        status: { in: ['WON', 'LOST'] },
        lockedOdds: { gte: WINRATE_MIN_ODDS },
        stake: { gte: HONOR_MIN_STAKE },
      },
      orderBy: { settledAt: 'asc' },
      select: { status: true },
    });

    let cur = 0;
    let best = 0;
    for (const b of bets) {
      if (b.status === 'WON') {
        cur += 1;
        best = Math.max(best, cur);
      } else {
        cur = 0;
      }
    }
    const currentStreak = cur; // 末尾連續 WON = 目前連勝

    await this.prisma.userBettingStat.upsert({
      where: { userId },
      create: { userId, currentStreak, bestStreak: best },
      update: { currentStreak, bestStreak: best },
    });

    // 連勝成就（依 bestStreak）
    for (const a of STREAK_ACHIEVEMENTS) {
      if (best >= a.n) await this.award(userId, a.code, a.badge, best);
    }
    if (best >= 5) await this.updateRecord('LONGEST_STREAK', userId, best, `${best} 連勝`);

    // 命中成就（最大 WON 賠率，注額達門檻）
    const maxWon = await this.prisma.bet.aggregate({
      where: { userId, status: 'WON', stake: { gte: HONOR_MIN_STAKE } },
      _max: { lockedOdds: true },
    });
    const maxOdds = maxWon._max.lockedOdds?.toNumber() ?? 0;
    for (const a of UPSET_ACHIEVEMENTS) {
      if (maxOdds >= a.minOdds) await this.award(userId, a.code, a.badge, maxOdds);
    }
    if (maxOdds >= 5) await this.updateRecord('BIGGEST_UPSET', userId, maxOdds, `命中賠率 ${maxOdds}`);
  }

  /** 被跟單時（二期）：由累計被跟單數頒發帶單成就 + 更新影響力名人堂。 */
  async onFollowed(ownerId: string): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ c: number }>>(
      Prisma.sql`SELECT count(*)::int AS c FROM pick_follows pf JOIN bets b ON b.id = pf.pick_bet_id WHERE b.user_id = ${ownerId}`,
    );
    const total = rows[0]?.c ?? 0;
    for (const a of FOLLOW_ACHIEVEMENTS) {
      if (total >= a.n) await this.award(ownerId, a.code, a.badge, total);
    }
    if (total >= 100) await this.updateRecord('TOP_INFLUENCE', ownerId, total, `累計被跟單 ${total}`);
  }

  /** 頒發成就：寫 HonorAward（永久、不重複）+ 發同名成就徽章（買不到）。 */
  private async award(userId: string, code: string, badgeName: string, value: number): Promise<void> {
    const exists = await this.prisma.honorAward.findFirst({ where: { userId, code, seasonId: null }, select: { id: true } });
    if (exists) return; // 已擁有
    await this.prisma.honorAward.create({ data: { userId, code, seasonId: null, value } });
    await this.grantBadge(userId, badgeName);
    this.logger.log(`頒發成就 ${code}（${badgeName}）→ user=${userId}`);
  }

  /** 發成就徽章（CosmeticItem BADGE，只發一次）。品項未 seed 則略過（不阻斷）。 */
  private async grantBadge(userId: string, badgeName: string): Promise<void> {
    const item = await this.prisma.cosmeticItem.findFirst({ where: { name: badgeName, type: 'BADGE' }, select: { id: true } });
    if (!item) {
      this.logger.warn(`成就徽章未 seed，略過發放：${badgeName}`);
      return;
    }
    const owned = await this.prisma.userCosmetic.findUnique({
      where: { userId_itemId: { userId, itemId: item.id } },
      select: { id: true },
    });
    if (!owned) await this.prisma.userCosmetic.create({ data: { userId, itemId: item.id, source: 'EVENT' } });
  }

  /** 更新名人堂紀錄：新值超過現任保持人才換人（平手保留現任）。 */
  private async updateRecord(recordType: string, userId: string, value: number, context: string): Promise<void> {
    const cur = await this.prisma.hallOfFameRecord.findFirst({ where: { recordType, isCurrent: true } });
    if (cur && cur.value >= value) return;
    await this.prisma.$transaction([
      this.prisma.hallOfFameRecord.updateMany({ where: { recordType, isCurrent: true }, data: { isCurrent: false } }),
      this.prisma.hallOfFameRecord.create({
        data: { recordType, userId, value, context, achievedAt: new Date(), isCurrent: true },
      }),
    ]);
  }
}
