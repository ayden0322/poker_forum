import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface FriendlyListFilter {
  status?: 'scheduled' | 'live' | 'finished';
  featured?: boolean;
  date?: string; // YYYY-MM-DD（台灣時區）
  from?: string; // YYYY-MM-DD（台灣時區，含）
  to?: string; // YYYY-MM-DD（台灣時區，含）
  limit?: number;
}

const SEASON = 2026;
const TW_OFFSET_MS = 8 * 60 * 60 * 1000; // 台灣 UTC+8（無日光節約）

/** 把「台灣日期 YYYY-MM-DD」轉成當天 00:00 的 UTC 時間 */
function twDateToUtcStart(twDate: string): Date {
  return new Date(new Date(`${twDate}T00:00:00Z`).getTime() - TW_OFFSET_MS);
}

/** 取某個 UTC 時間點所屬的「台灣日期字串」 */
function utcToTwDate(d: Date): string {
  return new Date(d.getTime() + TW_OFFSET_MS).toISOString().slice(0, 10);
}

@Injectable()
export class FriendliesService {
  constructor(private prisma: PrismaService) {}

  /** 賽程列表（可篩選 status / featured / date / from-to） */
  async listMatches(filter: FriendlyListFilter = {}) {
    const where: any = { season: SEASON };
    if (filter.status) where.status = filter.status;
    if (filter.featured !== undefined) where.isFeatured = filter.featured;

    if (filter.date) {
      const start = twDateToUtcStart(filter.date);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      where.kickoffAt = { gte: start, lt: end };
    } else if (filter.from || filter.to) {
      where.kickoffAt = {};
      if (filter.from) where.kickoffAt.gte = twDateToUtcStart(filter.from);
      if (filter.to) {
        const end = new Date(twDateToUtcStart(filter.to).getTime() + 24 * 60 * 60 * 1000);
        where.kickoffAt.lt = end;
      }
    }

    const matches = await this.prisma.friendlyMatch.findMany({
      where,
      orderBy: { kickoffAt: 'asc' },
      take: filter.limit ?? undefined,
      include: { homeTeam: true, awayTeam: true },
    });

    return matches.map((m) => this.serializeMatch(m));
  }

  /**
   * 按台灣日期分段的賽程時間軸（友誼賽板塊主視覺）
   * 回傳 [{ date, label, weekday, matches: [...] }]，已依日期升冪。
   */
  async listByDate(filter: FriendlyListFilter = {}) {
    const list = await this.listMatches(filter);
    const groups = new Map<string, typeof list>();
    for (const m of list) {
      const day = utcToTwDate(new Date(m.kickoffAt));
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(m);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, matches]) => ({
        date,
        weekday: new Date(`${date}T00:00:00+08:00`).toLocaleDateString('zh-TW', {
          weekday: 'short',
          timeZone: 'Asia/Taipei',
        }),
        matches,
      }));
  }

  /** 單場詳情 */
  async getMatch(id: number) {
    const m = await this.prisma.friendlyMatch.findUnique({
      where: { id },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!m) throw new NotFoundException(`Friendly match ${id} not found`);
    return this.serializeMatch(m);
  }

  /** 賽季概況（Hero：本季 X 場 · 今日 Y 場 · LIVE Z 場） */
  async getOverview() {
    const todayTw = utcToTwDate(new Date());
    const start = twDateToUtcStart(todayTw);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const [total, today, live, featured] = await Promise.all([
      this.prisma.friendlyMatch.count({ where: { season: SEASON } }),
      this.prisma.friendlyMatch.count({
        where: { season: SEASON, kickoffAt: { gte: start, lt: end } },
      }),
      this.prisma.friendlyMatch.count({ where: { season: SEASON, status: 'live' } }),
      this.prisma.friendlyMatch.count({ where: { season: SEASON, isFeatured: true } }),
    ]);

    return { season: SEASON, total, today, live, featured };
  }

  // ===== 序列化（前端友善欄位）=====
  private serializeMatch(m: any) {
    const teamView = (t: any) => ({
      id: t.id,
      apiTeamId: t.apiTeamId,
      nameEn: t.nameEn,
      nameZh: t.nameZh ?? t.nameEn,
      logoUrl: t.logoUrl,
      isMarquee: t.isMarquee,
    });

    return {
      id: m.id,
      apiFixtureId: m.apiFixtureId,
      season: m.season,
      round: m.round,
      kickoffAt: m.kickoffAt.toISOString(),
      venue: m.venue,
      venueCity: m.venueCity,
      home: teamView(m.homeTeam),
      away: teamView(m.awayTeam),
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
      statusShort: m.statusShort,
      liveMinute: m.liveMinute,
      isFeatured: m.isFeatured,
    };
  }
}
