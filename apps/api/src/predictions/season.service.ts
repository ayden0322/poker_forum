// 榮譽系統 — 月賽季結算與冠軍加冕（2026-07）
// 每月底結算上個台北月：凍結三榜(一期只 ACCURACY/PROFIT) top3 → SeasonStanding；
// 榜首 → ChampionReign(次月在位) + 冠軍限定稱號(expiresAt=在位到期，自動卸冕) + 加冕徽記(永久) + 名人堂；
// 亞軍/季軍 → HonorAward + 徽章；並判神準射手(單月準度≥70%,≥30場)。冪等：同季重跑 upsert 無害。

import { Injectable, Logger } from '@nestjs/common';
import { LeaderboardService, LeaderboardType, MIN_SETTLED, minSettledFor } from './leaderboard.service';
import { PrismaService } from '../common/prisma.service';

type HonorBoard = 'ACCURACY' | 'PROFIT' | 'INFLUENCE';

const BOARDS: Array<{ board: HonorBoard; lbType: LeaderboardType; title: string }> = [
  { board: 'ACCURACY', lbType: 'winrate', title: '本季神算王' },
  { board: 'PROFIT', lbType: 'profit', title: '本季獲利王' },
];

const CHAMPION_CREST = '加冕徽記'; // BADGE，冠軍永久紀念（seed 建立）
const RUNNERUP_BADGE: Record<number, string> = { 2: '本季亞軍', 3: '本季季軍' };
const SHARP_SHOOTER_MIN_WINRATE = 70;

@Injectable()
export class SeasonService {
  private readonly logger = new Logger(SeasonService.name);

  constructor(
    private prisma: PrismaService,
    private leaderboard: LeaderboardService,
  ) {}

  /** 上個台北月的區間 + 次月在位範圍 + 賽季 key。 */
  static lastMonthRange(now: Date) {
    const tpe = new Date(now.getTime() + 8 * 3600_000);
    const y = tpe.getUTCFullYear();
    const m = tpe.getUTCMonth();
    const wallFirst = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 1));
    const toUtc = (d: Date) => new Date(d.getTime() - 8 * 3600_000); // 台北牆鐘 → 真實 UTC 瞬間
    const firstLast = wallFirst(y, m - 1);
    const firstThis = wallFirst(y, m);
    const firstNext = wallFirst(y, m + 1);
    const key = `${firstLast.getUTCFullYear()}-${String(firstLast.getUTCMonth() + 1).padStart(2, '0')}`;
    return { key, start: toUtc(firstLast), end: toUtc(firstThis), reignFrom: toUtc(firstThis), reignTo: toUtc(firstNext) };
  }

  /** 結算上個月並加冕。回傳各榜冠軍 nickname（無人達門檻則該榜略過）。 */
  async closeSeasonAndCrown(now = new Date()): Promise<Array<{ board: HonorBoard; nickname: string }>> {
    const { key, start, end, reignFrom, reignTo } = SeasonService.lastMonthRange(now);
    const season = await this.prisma.season.upsert({
      where: { key },
      create: { key, startAt: start, endAt: end, status: 'CLOSED' },
      update: { status: 'CLOSED' },
    });

    const crowned: Array<{ board: HonorBoard; nickname: string }> = [];

    for (const { board, lbType, title } of BOARDS) {
      const rows = await this.leaderboard.standingsForRange(lbType, start, end, 3);
      if (!rows.length) {
        this.logger.log(`賽季 ${key} ${board} 榜無人達 ${minSettledFor(start)} 場門檻，略過`);
        continue;
      }
      // D1：獲利榜榜首淨利 ≤ 0 → 獲利王從缺（博彩負和，不把「最不虧的輸家」封王）
      if (board === 'PROFIT' && rows[0].profit <= 0) {
        this.logger.log(`賽季 ${key} 獲利榜榜首淨利 ${rows[0].profit} ≤ 0，獲利王從缺（不加冕）`);
        continue;
      }
      const idByNick = await this.userIdsByNickname(rows.map((r) => r.nickname));

      for (const row of rows) {
        const userId = idByNick.get(row.nickname);
        if (!userId) continue;
        const value = board === 'ACCURACY' ? row.winRate : row.profit;
        // 凍結排名快照
        await this.prisma.seasonStanding.upsert({
          where: { seasonId_board_userId: { seasonId: season.id, board, userId } },
          create: { seasonId: season.id, board, userId, value, rank: row.rank, settledCount: row.n },
          update: { value, rank: row.rank, settledCount: row.n },
        });

        if (row.rank === 1) {
          await this.crownChampion(season.id, board, userId, title, reignFrom, reignTo);
          await this.award(userId, `SEASON_${board}_1`, season.id, value);
          crowned.push({ board, nickname: row.nickname });
          if (board === 'ACCURACY') await this.updateRecord('BEST_MONTH_ACC', userId, value, `${key} 單月準度 ${value}%`);
        } else {
          await this.award(userId, `SEASON_${board}_${row.rank}`, season.id, value);
          await this.grantBadge(userId, RUNNERUP_BADGE[row.rank]);
        }
      }

      // 神準射手：準度榜達 ≥70% 且 ≥30 場者（一期取榜上可見者）
      // ★ 這裡刻意「不」套冷啟動軟門檻：軟門檻只放寬「入榜/加冕」，
      //   成就徽章的門檻寫在品項說明上（單月準度 ≥70%、≥30 場），放水會讓徽章說明變成謊話，
      //   而且徽章是永久的——首月用 10 場發出去的「神準射手」會永遠稀釋這枚徽章。
      if (board === 'ACCURACY') {
        const wide = await this.leaderboard.standingsForRange('winrate', start, end, 20);
        const idMap = await this.userIdsByNickname(wide.map((r) => r.nickname));
        for (const r of wide) {
          const uid = idMap.get(r.nickname);
          if (uid && r.winRate >= SHARP_SHOOTER_MIN_WINRATE && r.n >= MIN_SETTLED) {
            await this.award(uid, 'SHARP_SHOOTER', null, r.winRate);
            await this.grantBadge(uid, '神準射手');
          }
        }
      }
    }

    // 影響力 / 人氣王（二期）
    const infl = await this.leaderboard.influenceRanking(start, end, 3);
    if (infl.length) {
      const idByNick = await this.userIdsByNickname(infl.map((r) => r.nickname));
      for (const row of infl) {
        const userId = idByNick.get(row.nickname);
        if (!userId) continue;
        await this.prisma.seasonStanding.upsert({
          where: { seasonId_board_userId: { seasonId: season.id, board: 'INFLUENCE', userId } },
          create: { seasonId: season.id, board: 'INFLUENCE', userId, value: row.follows, rank: row.rank, settledCount: row.follows },
          update: { value: row.follows, rank: row.rank, settledCount: row.follows },
        });
        if (row.rank === 1) {
          await this.crownChampion(season.id, 'INFLUENCE', userId, '本季人氣王', reignFrom, reignTo);
          await this.award(userId, 'SEASON_INFLUENCE_1', season.id, row.follows);
          crowned.push({ board: 'INFLUENCE', nickname: row.nickname });
        } else {
          await this.award(userId, `SEASON_INFLUENCE_${row.rank}`, season.id, row.follows);
          await this.grantBadge(userId, RUNNERUP_BADGE[row.rank]);
        }
      }
    }

    this.logger.log(`賽季 ${key} 加冕完成：${crowned.map((c) => `${c.board}:${c.nickname}`).join('、') || '無'}`);
    return crowned;
  }

  /** 冠軍加冕：ChampionReign(次月) + 冠軍限定稱號(expiresAt=在位到期) + 加冕徽記(永久)。 */
  private async crownChampion(
    seasonId: string,
    board: HonorBoard,
    userId: string,
    titleName: string,
    reignFrom: Date,
    reignTo: Date,
  ): Promise<void> {
    await this.prisma.championReign.upsert({
      where: { seasonId_board: { seasonId, board } },
      create: { seasonId, board, userId, reignFrom, reignTo },
      update: { userId, reignFrom, reignTo },
    });

    const titleItem = await this.prisma.cosmeticItem.findFirst({ where: { name: titleName, type: 'TITLE' }, select: { id: true } });
    if (titleItem) {
      await this.prisma.$transaction(async (tx) => {
        await tx.userCosmetic.updateMany({ where: { userId, equippedSlot: 'TITLE' }, data: { equippedSlot: null } });
        await tx.userCosmetic.upsert({
          where: { userId_itemId: { userId, itemId: titleItem.id } },
          create: { userId, itemId: titleItem.id, source: 'EVENT', equippedSlot: 'TITLE', expiresAt: reignTo },
          update: { equippedSlot: 'TITLE', expiresAt: reignTo },
        });
      });
    } else {
      this.logger.warn(`冠軍稱號未 seed，略過：${titleName}`);
    }
    await this.grantBadge(userId, CHAMPION_CREST); // 加冕徽記（永久紀念）
  }

  private async userIdsByNickname(nicknames: string[]): Promise<Map<string, string>> {
    const users = await this.prisma.user.findMany({ where: { nickname: { in: nicknames } }, select: { id: true, nickname: true } });
    return new Map(users.map((u) => [u.nickname, u.id]));
  }

  private async award(userId: string, code: string, seasonId: string | null, value: number): Promise<void> {
    const exists = await this.prisma.honorAward.findFirst({ where: { userId, code, seasonId }, select: { id: true } });
    if (exists) return;
    await this.prisma.honorAward.create({ data: { userId, code, seasonId, value } });
  }

  private async grantBadge(userId: string, badgeName?: string): Promise<void> {
    if (!badgeName) return;
    const item = await this.prisma.cosmeticItem.findFirst({ where: { name: badgeName, type: 'BADGE' }, select: { id: true } });
    if (!item) {
      this.logger.warn(`榮耀徽章未 seed，略過：${badgeName}`);
      return;
    }
    const owned = await this.prisma.userCosmetic.findUnique({ where: { userId_itemId: { userId, itemId: item.id } }, select: { id: true } });
    if (!owned) await this.prisma.userCosmetic.create({ data: { userId, itemId: item.id, source: 'EVENT' } });
  }

  private async updateRecord(recordType: string, userId: string, value: number, context: string): Promise<void> {
    const cur = await this.prisma.hallOfFameRecord.findFirst({ where: { recordType, isCurrent: true } });
    if (cur && cur.value >= value) return;
    await this.prisma.$transaction([
      this.prisma.hallOfFameRecord.updateMany({ where: { recordType, isCurrent: true }, data: { isCurrent: false } }),
      this.prisma.hallOfFameRecord.create({ data: { recordType, userId, value, context, achievedAt: new Date(), isCurrent: true } }),
    ]);
  }
}
