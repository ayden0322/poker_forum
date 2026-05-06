import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface MatchListFilter {
  status?: 'scheduled' | 'live' | 'finished';
  stage?: 'group' | 'knockout';
  group?: string;
  date?: string; // YYYY-MM-DD（UTC）
}

@Injectable()
export class WorldCupService {
  constructor(private prisma: PrismaService) {}

  /** 賽程列表，支援多重篩選 */
  async listMatches(filter: MatchListFilter = {}) {
    const where: any = {};
    if (filter.status) where.status = filter.status;
    if (filter.stage) where.stage = filter.stage;
    if (filter.group) where.groupName = `Group ${filter.group.toUpperCase()}`;
    if (filter.date) {
      const start = new Date(`${filter.date}T00:00:00Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      where.kickoffAt = { gte: start, lt: end };
    }

    const matches = await this.prisma.worldCupMatch.findMany({
      where,
      orderBy: { kickoffAt: 'asc' },
      include: { homeTeam: true, awayTeam: true },
    });

    return matches.map((m) => this.serializeMatch(m));
  }

  /** 單場比賽詳情 */
  async getMatch(id: number) {
    const m = await this.prisma.worldCupMatch.findUnique({
      where: { id },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!m) throw new NotFoundException(`Match ${id} not found`);
    return this.serializeMatch(m);
  }

  /** 全 48 隊 */
  async listTeams() {
    const teams = await this.prisma.worldCupTeam.findMany({
      orderBy: [{ groupName: 'asc' }, { nameEn: 'asc' }],
    });
    return teams;
  }

  /**
   * 12 組積分榜
   * 規則：勝 3 分 / 平 1 分 / 負 0 分；同分比淨勝球 → 進球數
   */
  async getGroupStandings() {
    const teams = await this.prisma.worldCupTeam.findMany({
      where: { groupName: { not: null } },
      include: {
        matchesAsHome: { where: { status: 'finished', stage: 'group' } },
        matchesAsAway: { where: { status: 'finished', stage: 'group' } },
      },
    });

    type Row = {
      team: typeof teams[number];
      played: number;
      won: number;
      drawn: number;
      lost: number;
      gf: number;
      ga: number;
      gd: number;
      pts: number;
    };

    const groupMap = new Map<string, Row[]>();

    for (const t of teams) {
      let played = 0, won = 0, drawn = 0, lost = 0, gf = 0, ga = 0;
      for (const m of t.matchesAsHome) {
        if (m.homeScore == null || m.awayScore == null) continue;
        played++; gf += m.homeScore; ga += m.awayScore;
        if (m.homeScore > m.awayScore) won++;
        else if (m.homeScore === m.awayScore) drawn++;
        else lost++;
      }
      for (const m of t.matchesAsAway) {
        if (m.homeScore == null || m.awayScore == null) continue;
        played++; gf += m.awayScore; ga += m.homeScore;
        if (m.awayScore > m.homeScore) won++;
        else if (m.awayScore === m.homeScore) drawn++;
        else lost++;
      }
      const row: Row = {
        team: t,
        played, won, drawn, lost,
        gf, ga, gd: gf - ga,
        pts: won * 3 + drawn,
      };
      const g = t.groupName!;
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g)!.push(row);
    }

    const groups = Array.from(groupMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([groupName, rows]) => ({
        groupName,
        rows: rows
          .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.nameEn.localeCompare(b.team.nameEn))
          .map((r, idx) => ({
            rank: idx + 1,
            teamId: r.team.id,
            fifaCode: r.team.fifaCode,
            nameEn: r.team.nameEn,
            nameZh: r.team.nameZh,
            flag: r.team.flagEmoji,
            played: r.played,
            won: r.won,
            drawn: r.drawn,
            lost: r.lost,
            gf: r.gf,
            ga: r.ga,
            gd: r.gd,
            pts: r.pts,
          })),
      }));

    return groups;
  }

  /** Admin：更新單場比分與狀態 */
  async updateMatch(
    id: number,
    data: { homeScore?: number | null; awayScore?: number | null; status?: string; liveMinute?: number | null },
  ) {
    const exists = await this.prisma.worldCupMatch.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`Match ${id} not found`);

    return this.prisma.worldCupMatch.update({
      where: { id },
      data: {
        ...(data.homeScore !== undefined && { homeScore: data.homeScore }),
        ...(data.awayScore !== undefined && { awayScore: data.awayScore }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.liveMinute !== undefined && { liveMinute: data.liveMinute }),
      },
    });
  }

  // ===== 序列化（前端友善欄位）=====
  private serializeMatch(m: any) {
    const teamView = (t: any, ph: string | null) => {
      if (t) {
        return {
          id: t.id,
          fifaCode: t.fifaCode,
          nameEn: t.nameEn,
          nameZh: t.nameZh ?? t.nameEn,
          flag: t.flagEmoji,
          isPlaceholder: false,
        };
      }
      return {
        id: null,
        fifaCode: null,
        nameEn: ph ?? '?',
        nameZh: this.localizePlaceholder(ph),
        flag: null,
        isPlaceholder: true,
      };
    };

    return {
      id: m.id,
      matchNumber: m.matchNumber,
      round: m.round,
      stage: m.stage,
      group: m.groupName,
      kickoffAt: m.kickoffAt.toISOString(),
      venue: m.venue,
      home: teamView(m.homeTeam, m.homePlaceholder),
      away: teamView(m.awayTeam, m.awayPlaceholder),
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
      liveMinute: m.liveMinute,
    };
  }

  /** 把 W101 / 1A / 3A/B/C/D/F 轉成中文友善敘述 */
  private localizePlaceholder(ph: string | null): string {
    if (!ph) return '待定';
    let m = /^W(\d+)$/.exec(ph);
    if (m) return `第 ${m[1]} 場勝者`;
    m = /^L(\d+)$/.exec(ph);
    if (m) return `第 ${m[1]} 場敗者`;
    m = /^([12])([A-L])$/.exec(ph);
    if (m) return `${m[2]} 組第 ${m[1]} 名`;
    if (/^3[A-L](\/[A-L])+$/.test(ph)) return `${ph.slice(1)} 組第 3 名`;
    return ph;
  }
}
