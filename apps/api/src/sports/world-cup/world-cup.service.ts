import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import {
  callFootballApi,
  syncWorldCupScores,
  findFixtureId,
  normalizeDetails,
  EMPTY_DETAILS,
  WC_LEAGUE_ID,
  WC_SEASON,
  ApiFixture,
  ApiEvent,
  ApiStatTeam,
  ApiLineupTeam,
  MatchDetails,
} from './world-cup.apisports';

export interface MatchListFilter {
  status?: 'scheduled' | 'live' | 'finished';
  stage?: 'group' | 'knockout';
  group?: string;
  date?: string; // YYYY-MM-DD（UTC）
}

/**
 * 開球到視為完場的視窗：90 分鐘 + 中場 15 + 傷停/賽後緩衝 ≈ 130 分鐘
 * ⚠️ 與前端 apps/web/src/lib/world-cup-status.ts 的 WC_LIVE_WINDOW_MS 必須一致
 */
const LIVE_WINDOW_MS = 130 * 60 * 1000;

@Injectable()
export class WorldCupService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // 賽事細節用的輕量記憶體快取（避免每次請求都打 API-Sports）
  private detailCache = new Map<string, { exp: number; val: any }>();
  private async cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = this.detailCache.get(key);
    if (hit && hit.exp > Date.now()) return hit.val as T;
    const val = await fn();
    this.detailCache.set(key, { exp: Date.now() + ttlMs, val });
    return val;
  }

  /**
   * 單場賽事細節（進球/事件、數據、先發陣容），整合自 API-Sports。
   * 未開賽（距開賽 >1 小時）或找不到 fixture 時回 available:false。
   */
  async getMatchDetails(matchNumber: number): Promise<MatchDetails> {
    const m = await this.prisma.worldCupMatch.findUnique({
      where: { matchNumber },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!m || !m.homeTeam || !m.awayTeam) return EMPTY_DETAILS;
    // 距開賽超過 1 小時的未來場次沒有 events/陣容，省 API 直接回空
    if (Date.now() < m.kickoffAt.getTime() - 60 * 60 * 1000) return EMPTY_DETAILS;

    const apiKey = this.config.get<string>('API_SPORTS_KEY', '');
    if (!apiKey) return EMPTY_DETAILS;

    try {
      const fixtures = await this.cached('wc:fixtures', 60_000, () =>
        callFootballApi<ApiFixture[]>(apiKey, '/fixtures', { league: WC_LEAGUE_ID, season: WC_SEASON }),
      );
      const fid = findFixtureId(fixtures, m.homeTeam.nameEn, m.awayTeam.nameEn);
      if (!fid) return EMPTY_DETAILS;

      // 完賽資料固定，長快取；進行中短快取保即時
      const finished = this.deriveStatus(m.kickoffAt) === 'finished';
      const ttl = finished ? 60 * 60 * 1000 : 30_000;
      return await this.cached(`wc:det:${fid}`, ttl, async () => {
        const [events, stats, lineups] = await Promise.all([
          callFootballApi<ApiEvent[]>(apiKey, '/fixtures/events', { fixture: fid }),
          callFootballApi<ApiStatTeam[]>(apiKey, '/fixtures/statistics', { fixture: fid }),
          callFootballApi<ApiLineupTeam[]>(apiKey, '/fixtures/lineups', { fixture: fid }),
        ]);
        return normalizeDetails(m.homeTeam!.nameEn, events, stats, lineups);
      });
    } catch {
      return EMPTY_DETAILS;
    }
  }

  /** 手動觸發：從 API-Sports 全量同步小組賽比分（admin 鈕用） */
  async syncFromApiSports() {
    const apiKey = this.config.get<string>('API_SPORTS_KEY', '');
    if (!apiKey) throw new Error('API_SPORTS_KEY 未設定');
    const fixtures = await callFootballApi<ApiFixture[]>(apiKey, '/fixtures', {
      league: WC_LEAGUE_ID,
      season: WC_SEASON,
    });
    return syncWorldCupScores(this.prisma, fixtures);
  }

  /**
   * 依開賽時間推算狀態（忽略 DB 手動欄位）
   * 因目前資料源無即時狀態 feed，狀態一律由時間推算
   */
  private deriveStatus(kickoffAt: Date): 'scheduled' | 'live' | 'finished' {
    const now = Date.now();
    const k = kickoffAt.getTime();
    if (now < k) return 'scheduled';
    if (now < k + LIVE_WINDOW_MS) return 'live';
    return 'finished';
  }

  /** 賽程列表，支援多重篩選（status 改用開賽時間推算後在記憶體篩） */
  async listMatches(filter: MatchListFilter = {}) {
    const where: any = {};
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

    let list = matches.map((m) => this.serializeMatch(m));
    if (filter.status) list = list.filter((m) => m.status === filter.status);
    return list;
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
    // 狀態改時間推算後 DB status 不可靠；積分只算「開賽時間已過 + 有比分」的場次，
    // 避免 seed/預填比分的未來場次污染積分榜
    const now = new Date();
    const playedWhere = {
      stage: 'group',
      kickoffAt: { lt: now },
      homeScore: { not: null },
      awayScore: { not: null },
    } as const;
    const teams = await this.prisma.worldCupTeam.findMany({
      where: { groupName: { not: null } },
      include: {
        matchesAsHome: { where: playedWhere },
        matchesAsAway: { where: playedWhere },
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
      status: this.deriveStatus(m.kickoffAt),
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
