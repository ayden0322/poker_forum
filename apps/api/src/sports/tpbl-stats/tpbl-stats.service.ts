import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis.service';
import { LEAGUE_CONFIG } from '../sports.config';
import {
  NormalizedBasketballGame,
  NormalizedStanding,
} from '../basketball-common/basketball-common.types';

/**
 * TPBL（台灣職業籃球大聯盟）官方免費 API adapter
 *
 * 資料源：`https://api.tpbl.basketball/api`（無需 key，回乾淨 JSON、隊名直接是中文，免翻譯）
 * 見 memory `reference_tpbl_free_api.md`。
 *
 * 輸出統一成 basketball-common 的 NormalizedBasketballGame / NormalizedStanding，
 * 讓前端同一套 widget 通吃 API-Sports 與 TPBL。
 *
 * 結構要點：
 * - season（賽季）：status=IN_PROGRESS 者為當季
 * - event（賽事）：男子組
 * - division（分組）：例行賽 → standings 所在；全季賽程從 /seasons/{id}/games 一次拉
 */
@Injectable()
export class TpblStatsService {
  private readonly logger = new Logger(TpblStatsService.name);
  private readonly base = 'https://api.tpbl.basketball/api';

  constructor(private redis: RedisService) {}

  getCapabilities() {
    return LEAGUE_CONFIG['tpbl']?.capabilities ?? null;
  }

  // ============ 底層 fetch + 快取 ============

  private async get<T>(path: string): Promise<T | null> {
    const url = `${this.base}${path}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        this.logger.error(`TPBL API ${res.status}：${url}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      this.logger.error(`TPBL API 失敗：${url} ${err}`);
      return null;
    }
  }

  private async cached<T>(cacheKey: string, ttl: number, fetcher: () => Promise<T | null>): Promise<T | null> {
    const hit = await this.redis.get<T>(cacheKey);
    if (hit) return hit;
    const data = await fetcher();
    if (data) await this.redis.set(cacheKey, data, ttl);
    return data;
  }

  // ============ 結構解析（賽季 / 例行賽分組）============

  /** 當前賽季 id（status=IN_PROGRESS；無則取最後一季） */
  private async getCurrentSeasonId(): Promise<number | null> {
    const seasons = await this.cached<any[]>('tpbl:seasons', 3600, () => this.get<any[]>('/seasons'));
    if (!seasons?.length) return null;
    const inProgress = seasons.find((s) => s.status === 'IN_PROGRESS');
    return (inProgress ?? seasons[seasons.length - 1])?.id ?? null;
  }

  /** 當季「例行賽」division id（standings 用） */
  private async getRegularDivisionId(seasonId: number): Promise<number | null> {
    const events = await this.cached<any[]>(`tpbl:season:${seasonId}:events`, 3600, () =>
      this.get<any[]>(`/seasons/${seasonId}/events`),
    );
    const event = events?.[0];
    if (!event) return null;
    const divisions = await this.cached<any[]>(`tpbl:event:${event.id}:divisions`, 3600, () =>
      this.get<any[]>(`/events/${event.id}/divisions`),
    );
    if (!divisions?.length) return null;
    const regular = divisions.find((d) => d.name === '例行賽') ?? divisions[0];
    return regular?.id ?? null;
  }

  // ============ 比賽 ============

  /** 全季賽程（一次拉，正規化）*/
  async getSeasonSchedule(): Promise<NormalizedBasketballGame[]> {
    const seasonId = await this.getCurrentSeasonId();
    if (!seasonId) return [];

    const cacheKey = `tpbl:season:${seasonId}:schedule`;
    const games = await this.cached<NormalizedBasketballGame[]>(cacheKey, 300, async () => {
      const raw = await this.get<any[]>(`/seasons/${seasonId}/games`);
      if (!raw || !Array.isArray(raw)) return [];
      return raw.map((g) => this.normalizeGame(g));
    });
    return games ?? [];
  }

  /** 指定台灣日期的比賽（從全季賽程過濾）*/
  async getGamesByDate(date: string): Promise<NormalizedBasketballGame[]> {
    const season = await this.getSeasonSchedule();
    return season.filter((g) => this.twDate(g.timestamp) === date);
  }

  /** 台灣三日賽事 */
  async getRecentGamesTw() {
    const season = await this.getSeasonSchedule();
    const twNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const y = new Date(twNow); y.setDate(y.getDate() - 1);
    const tm = new Date(twNow); tm.setDate(tm.getDate() + 1);
    const dY = fmt(y), dT = fmt(twNow), dM = fmt(tm);
    return {
      yesterday: season.filter((g) => this.twDate(g.timestamp) === dY),
      today: season.filter((g) => this.twDate(g.timestamp) === dT),
      tomorrow: season.filter((g) => this.twDate(g.timestamp) === dM),
    };
  }

  /** 單場比賽 */
  async getGame(gameId: number) {
    const cacheKey = `tpbl:game:${gameId}`;
    return this.cached(cacheKey, 60, async () => {
      const raw = await this.get<any>(`/games/${gameId}`);
      if (!raw) return null;
      return this.normalizeGame(raw);
    });
  }

  /** 單場 box score（球員/球隊統計）*/
  async getBoxScore(gameId: number) {
    const caps = this.getCapabilities();
    if (!caps?.boxScore) return { teams: [], players: [] };
    const cacheKey = `tpbl:boxscore:${gameId}`;
    const data = await this.cached(cacheKey, 60, async () => {
      const stats = await this.get<any>(`/games/${gameId}/stats`);
      return stats ?? { teams: [], players: [] };
    });
    return data ?? { teams: [], players: [] };
  }

  // ============ 排名 ============

  async getStandings(): Promise<NormalizedStanding[]> {
    const seasonId = await this.getCurrentSeasonId();
    if (!seasonId) return [];
    const divId = await this.getRegularDivisionId(seasonId);
    if (!divId) return [];

    const cacheKey = `tpbl:standings:${divId}`;
    const result = await this.cached<NormalizedStanding[]>(cacheKey, 600, async () => {
      const raw = await this.get<any[]>(`/divisions/${divId}/games/standings`);
      if (!raw || !Array.isArray(raw)) return [];
      return raw.map((row): NormalizedStanding => {
        const wins = row.score_won_matches ?? 0;
        const losses = row.score_lost_matches ?? 0;
        const draws = row.score_draw_matches ?? 0;
        const played = wins + losses + draws;
        return {
          rank: row.rank ?? 0,
          team: {
            id: row.team?.id ?? 0,
            name: row.team?.name ?? '',
            nameZhTw: row.team?.name ?? null, // TPBL 直接給中文
            shortName: null,
            logo: row.team?.meta?.logo ?? '',
          },
          played,
          wins,
          losses,
          winPct: wins + losses > 0 ? Number((wins / (wins + losses)).toFixed(3)) : null,
          gamesBehind: row.games_behind ?? null,
          streak: row.streaks ?? null,
          group: '例行賽',
        };
      });
    });
    return result ?? [];
  }

  // ============ 球隊 ============

  /** 球隊列表（從 standings 取，含中文名與 logo）*/
  async getTeams() {
    const standings = await this.getStandings();
    return standings.map((s) => ({
      id: s.team.id,
      name: s.team.name,
      nameZhTw: s.team.nameZhTw,
      shortName: s.team.shortName,
      logo: s.team.logo,
    }));
  }

  async getTeamRecentGames(teamId: number) {
    const season = await this.getSeasonSchedule();
    return season
      .filter((g) => g.teams.home.id === teamId || g.teams.away.id === teamId)
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  }

  async getHeadToHead(teamId: number, opponentId: number, limit = 10) {
    const season = await this.getSeasonSchedule();
    const finished = season
      .filter((g) => g.statusShort === 'FT')
      .filter(
        (g) =>
          (g.teams.home.id === teamId && g.teams.away.id === opponentId) ||
          (g.teams.home.id === opponentId && g.teams.away.id === teamId),
      )
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      .slice(0, limit);

    let teamWins = 0;
    let opponentWins = 0;
    for (const g of finished) {
      const isHome = g.teams.home.id === teamId;
      const my = isHome ? g.teams.home.score : g.teams.away.score;
      const opp = isHome ? g.teams.away.score : g.teams.home.score;
      if (my == null || opp == null) continue;
      if (my > opp) teamWins++;
      else if (opp > my) opponentWins++;
    }
    return { games: finished, summary: { total: finished.length, teamWins, opponentWins } };
  }

  async getTeamOverview(teamId: number) {
    const [teams, recentGames, standings] = await Promise.all([
      this.getTeams(),
      this.getTeamRecentGames(teamId),
      this.getStandings(),
    ]);
    const team = teams.find((t) => t.id === teamId) ?? null;
    return { team, recentGames, standings };
  }

  // ============ 內部工具 ============

  /** TPBL 原始 game → NormalizedBasketballGame */
  private normalizeGame(g: any): NormalizedBasketballGame {
    const home = g.home_team ?? {};
    const away = g.away_team ?? {};
    // TPBL 的 gamed_at 是「YYYY-MM-DD HH:MM:SS」無時區標記的台灣時間（UTC+8），
    // 直接 Date.parse 會被當伺服器本地時，故補上 +08:00 再解析。
    const rawDt = g.gamed_at ?? (g.game_date ? `${g.game_date} ${g.game_time ?? '00:00:00'}` : null);
    const isoDt = rawDt ? `${rawDt.replace(' ', 'T')}+08:00` : null;
    const tsMs = isoDt ? Date.parse(isoDt) : NaN;
    const timestamp = Number.isFinite(tsMs) ? Math.floor(tsMs / 1000) : 0;

    const { statusLong, statusShort } = this.mapStatus(g);
    const homeScore = typeof home.won_score === 'number' ? home.won_score : null;
    const awayScore = typeof away.won_score === 'number' ? away.won_score : null;

    return {
      id: g.id,
      league: 'tpbl',
      date: g.gamed_at ?? g.game_date ?? '',
      timestamp,
      status: statusLong,
      statusShort,
      stage: g.round != null ? `第 ${g.round} 輪` : null,
      venue: g.venue ?? null,
      teams: {
        home: {
          id: home.id ?? 0,
          name: home.name ?? '',
          nameZhTw: home.name ?? null,
          shortName: home.meta?.alt_name ?? null,
          logo: home.meta?.logo ?? '',
          score: homeScore,
        },
        away: {
          id: away.id ?? 0,
          name: away.name ?? '',
          nameZhTw: away.name ?? null,
          shortName: away.meta?.alt_name ?? null,
          logo: away.meta?.logo ?? '',
          score: awayScore,
        },
      },
      scores: {
        home: { quarter_1: null, quarter_2: null, quarter_3: null, quarter_4: null, over_time: null, total: homeScore },
        away: { quarter_1: null, quarter_2: null, quarter_3: null, quarter_4: null, over_time: null, total: awayScore },
      },
    };
  }

  private mapStatus(g: any): { statusLong: string; statusShort: string } {
    if (g.is_live) return { statusLong: '進行中', statusShort: 'LIVE' };
    if (g.status === 'COMPLETED') return { statusLong: '比賽結束', statusShort: 'FT' };
    return { statusLong: '尚未開始', statusShort: 'NS' };
  }

  private twDate(timestamp: number): string {
    if (!timestamp) return '';
    return new Date(timestamp * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
  }
}
