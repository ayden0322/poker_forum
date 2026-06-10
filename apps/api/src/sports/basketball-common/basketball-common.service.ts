import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis.service';
import { PrismaService } from '../../common/prisma.service';
import { LEAGUE_CONFIG, CACHE_TTL, API_HOSTS } from '../sports.config';
import {
  isBasketballBoard,
  isTpblBoard,
  getLeagueCapabilities,
  ApiSportsBasketballGame,
  NormalizedBasketballGame,
  NormalizedStanding,
} from './basketball-common.types';
import { TpblStatsService } from '../tpbl-stats/tpbl-stats.service';

/**
 * 通用籃球服務（API-Sports 籃球聯賽：CBA / B.League / KBL / P.League+ / 各歐洲聯賽…）
 *
 * 資料來源：API-Sports Basketball v1
 * 策略（2026-06-10 拍板）：以資訊完整為導向、配額不用省 → 直接帶 league+season 拉全季資料，
 * 不再走免費方案的「只查 date 再後端過濾」限制。
 *
 * 能力閘門：依 LEAGUE_CONFIG.capabilities 決定是否呼叫 odds / players / box score，
 * 避免做出「呼叫了一直回空」的死碼（棒球 /players 覆轍）。
 *
 * 不含：NBA（ESPN bespoke）、TPBL（官方免費 API adapter，見 tpbl-stats）。
 */
@Injectable()
export class BasketballCommonService {
  private readonly logger = new Logger(BasketballCommonService.name);
  private readonly apiKey: string;
  private readonly host = API_HOSTS.basketball;

  constructor(
    private config: ConfigService,
    private redis: RedisService,
    private prisma: PrismaService,
    private tpbl: TpblStatsService,
  ) {
    this.apiKey = this.config.get<string>('API_SPORTS_KEY', '');
  }

  /** 通用籃球 controller 能服務的板塊（含 TPBL 與所有 API-Sports 籃球聯賽）*/
  isValidLeague(league: string): boolean {
    return isBasketballBoard(league);
  }

  /** 是否走 TPBL 官方 adapter */
  private isTpbl(league: string): boolean {
    return isTpblBoard(league);
  }

  private getLeagueConfig(league: string) {
    return LEAGUE_CONFIG[league];
  }

  getCapabilities(league: string) {
    return getLeagueCapabilities(league);
  }

  // ============ API-Sports 通用呼叫 ============

  private async callApi<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T | null> {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) query.set(k, String(v));
    const url = `https://${this.host}${endpoint}?${query.toString()}`;

    this.logger.debug(`Basketball API 呼叫：${url}`);

    try {
      const res = await fetch(url, {
        headers: { 'x-apisports-key': this.apiKey },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        this.logger.error(`Basketball API ${res.status}：${await res.text()}`);
        return null;
      }
      const data = await res.json() as { response: T; errors: Record<string, string> | unknown[] };
      const errs = data.errors;
      if (errs && (Array.isArray(errs) ? errs.length > 0 : Object.keys(errs).length > 0)) {
        this.logger.warn(`Basketball API 警告：${JSON.stringify(errs)}`);
      }
      return data.response;
    } catch (err) {
      this.logger.error(`Basketball API 失敗：${err}`);
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

  // ============ 翻譯工具 ============

  private async getTeamTranslations(teamIds: number[]): Promise<Map<number, { nameZhTw: string; shortName: string | null }>> {
    if (teamIds.length === 0) return new Map();
    const translations = await this.prisma.translation.findMany({
      where: { entityType: 'team', sport: 'basketball', apiId: { in: teamIds } },
      select: { apiId: true, nameZhTw: true, shortName: true },
    });
    return new Map(translations.map((t) => [t.apiId, { nameZhTw: t.nameZhTw, shortName: t.shortName }]));
  }

  // ============ 比賽資料 ============

  /**
   * 取得指定日期的比賽（跨聯賽共用「當日全籃球」快取，再過濾 leagueId）
   * 用於首頁即時賽事中心、三日賽事等「以日期為軸」的場景。
   */
  async getGamesByDate(league: string, date: string): Promise<NormalizedBasketballGame[]> {
    if (this.isTpbl(league)) return this.tpbl.getGamesByDate(date);
    const cfg = this.getLeagueConfig(league);
    if (!cfg) return [];

    const cacheKey = `basketball:${league}:games:${date}`;
    const ttl = CACHE_TTL.LIVE;

    const games = await this.cached<NormalizedBasketballGame[]>(cacheKey, ttl, async () => {
      const allCacheKey = `basketball:allgames:${date}`;
      let allGames = await this.redis.get<ApiSportsBasketballGame[]>(allCacheKey);
      if (!allGames) {
        allGames = await this.callApi<ApiSportsBasketballGame[]>('/games', { date });
        if (allGames) await this.redis.set(allCacheKey, allGames, ttl);
      }
      if (!allGames || !Array.isArray(allGames)) return [];
      const filtered = allGames.filter((g) => g.league?.id === cfg.leagueId);
      return this.normalizeAndTranslate(filtered, league);
    });

    return games ?? [];
  }

  /** 台灣時區三日賽事（昨日 / 今日 / 明日） */
  async getRecentGamesTw(league: string) {
    if (this.isTpbl(league)) return this.tpbl.getRecentGamesTw();
    const twNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const yesterday = new Date(twNow); yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(twNow); tomorrow.setDate(tomorrow.getDate() + 1);

    const [y, t, tm] = await Promise.all([
      this.getGamesByDate(league, fmt(yesterday)),
      this.getGamesByDate(league, fmt(twNow)),
      this.getGamesByDate(league, fmt(tomorrow)),
    ]);
    return { yesterday: y, today: t, tomorrow: tm };
  }

  /**
   * 全季賽程（直接帶 league+season 一次拉整季）
   * 用於 SSR 賽程頁 — 配額不省，整季資料一次到位、利於 SEO。
   */
  async getSeasonSchedule(league: string): Promise<NormalizedBasketballGame[]> {
    if (this.isTpbl(league)) return this.tpbl.getSeasonSchedule();
    const cfg = this.getLeagueConfig(league);
    if (!cfg) return [];

    const cacheKey = `basketball:${league}:season-schedule:${cfg.season}`;
    const games = await this.cached<NormalizedBasketballGame[]>(cacheKey, CACHE_TTL.SCHEDULE, async () => {
      const all = await this.callApi<ApiSportsBasketballGame[]>('/games', {
        league: cfg.leagueId,
        season: cfg.season,
      });
      if (!all || !Array.isArray(all)) return [];
      return this.normalizeAndTranslate(all, league);
    });
    return games ?? [];
  }

  /** 單場比賽（正規化成 NormalizedBasketballGame，與 TPBL 同形；scores 保留逐節） */
  async getGame(league: string, gameId: number): Promise<NormalizedBasketballGame | null> {
    if (this.isTpbl(league)) return this.tpbl.getGame(gameId);
    const cacheKey = `basketball:${league}:game:${gameId}`;
    const result = await this.cached<NormalizedBasketballGame | null>(cacheKey, CACHE_TTL.LIVE, async () => {
      const games = await this.callApi<ApiSportsBasketballGame[]>('/games', { id: gameId });
      const raw = games?.[0];
      if (!raw) return null;
      const [norm] = await this.normalizeAndTranslate([raw], league);
      return norm ?? null;
    });
    return result ?? null;
  }

  /** 單場 box score（球隊統計 + 球員統計）— 需 capabilities.boxScore */
  async getBoxScore(league: string, gameId: number) {
    if (this.isTpbl(league)) return this.tpbl.getBoxScore(gameId);
    const caps = this.getCapabilities(league);
    if (!caps?.boxScore) return { teams: [], players: [] };

    const cacheKey = `basketball:${league}:boxscore:${gameId}`;
    const data = await this.cached(cacheKey, CACHE_TTL.LIVE, async () => {
      const [teams, players] = await Promise.all([
        this.callApi<any[]>('/games/statistics/teams', { id: gameId }),
        this.callApi<any[]>('/games/statistics/players', { id: gameId }),
      ]);
      return { teams: teams ?? [], players: players ?? [] };
    });
    return data ?? { teams: [], players: [] };
  }

  // ============ 排名 ============

  async getStandings(league: string): Promise<NormalizedStanding[]> {
    if (this.isTpbl(league)) return this.tpbl.getStandings();
    const cfg = this.getLeagueConfig(league);
    if (!cfg) return [];

    const cacheKey = `basketball:${league}:standings:${cfg.season}`;
    const result = await this.cached<NormalizedStanding[]>(cacheKey, CACHE_TTL.STANDINGS, async () => {
      const raw = await this.callApi<any>('/standings', { league: cfg.leagueId, season: cfg.season });
      if (!raw) return null;

      // standings 為巢狀陣列 [[row, ...]]，先攤平
      const flatRows: any[] = Array.isArray(raw)
        ? (Array.isArray(raw[0]) ? (raw as any[][]).flat() : raw)
        : [];
      const teamIds = flatRows.map((r) => r?.team?.id).filter((id): id is number => typeof id === 'number');
      const trMap = await this.getTeamTranslations(teamIds);

      // 正規化成跨源統一形狀（NormalizedStanding）
      return flatRows
        .filter((row) => row?.team)
        .map((row): NormalizedStanding => {
          const tr = trMap.get(row.team.id);
          const winPctRaw = row.games?.win?.percentage;
          return {
            rank: row.position ?? 0,
            team: {
              id: row.team.id,
              name: row.team.name,
              nameZhTw: tr?.nameZhTw,
              shortName: tr?.shortName,
              logo: row.team.logo,
            },
            played: row.games?.played ?? null,
            wins: row.games?.win?.total ?? 0,
            losses: row.games?.lose?.total ?? 0,
            winPct: winPctRaw != null ? Number(winPctRaw) : null,
            gamesBehind: null,
            streak: row.form ?? null,
            pointsFor: row.points?.for ?? null,
            pointsAgainst: row.points?.against ?? null,
            group: row.group?.name ?? row.stage ?? null,
          };
        });
    });
    return result ?? [];
  }

  // ============ 球隊 ============

  async getTeams(league: string) {
    if (this.isTpbl(league)) return this.tpbl.getTeams();
    const cfg = this.getLeagueConfig(league);
    if (!cfg) return [];

    const cacheKey = `basketball:${league}:teams:${cfg.season}`;
    return this.cached(cacheKey, 86400, async () => {
      const teams = await this.callApi<any[]>('/teams', { league: cfg.leagueId, season: cfg.season });
      if (!teams) return [];
      const teamIds = teams.map((t) => t.id).filter(Boolean);
      const trMap = await this.getTeamTranslations(teamIds);
      return teams.map((t) => {
        const tr = trMap.get(t.id);
        return { ...t, nameZhTw: tr?.nameZhTw ?? t.name, shortName: tr?.shortName };
      });
    });
  }

  // ============ 球員（籃球 /players 需帶 team）============

  async getPlayers(league: string, teamId?: number) {
    // TPBL 球員名單走官方 API，於球員頁階段接入（避免誤用 API-Sports 空 leagueId）
    if (this.isTpbl(league)) return [];
    const caps = this.getCapabilities(league);
    if (!caps?.players) return [];
    const cfg = this.getLeagueConfig(league);
    if (!cfg) return [];
    // 籃球 API /players 需要 team 參數（無聯盟級名單），未帶 teamId 直接回空避免錯誤呼叫
    if (!teamId) return [];

    const cacheKey = `basketball:${league}:players:${teamId}:${cfg.season}`;
    return this.cached(cacheKey, CACHE_TTL.PLAYERS, async () => {
      return this.callApi('/players', { team: teamId, season: cfg.season });
    });
  }

  // ============ 賠率（需 capabilities.odds）============

  async getOdds(league: string, gameId?: number) {
    const caps = this.getCapabilities(league);
    if (!caps?.odds) return null;
    const cfg = this.getLeagueConfig(league);
    if (!cfg) return null;

    const cacheKey = `basketball:${league}:odds:${gameId ?? 'league'}`;
    return this.cached(cacheKey, CACHE_TTL.ODDS, async () => {
      const params: Record<string, string | number> = gameId
        ? { game: gameId }
        : { league: cfg.leagueId, season: cfg.season };
      return this.callApi('/odds', params);
    });
  }

  // ============ 球隊近期賽事 / 歷史對戰 / overview ============

  async getTeamRecentGames(league: string, teamId: number, days = 14) {
    if (this.isTpbl(league)) return this.tpbl.getTeamRecentGames(teamId);
    const cfg = this.getLeagueConfig(league);
    if (!cfg) return [];

    const safeDays = Math.min(days, 30);
    const cacheKey = `basketball:${league}:team:${teamId}:recent:${safeDays}`;
    return this.cached(cacheKey, 600, async () => {
      // 配額不省：直接從全季賽程過濾該隊已開打場次（一次 API、免逐日查）
      const season = await this.getSeasonSchedule(league);
      const games = season
        .filter((g) => g.teams.home.id === teamId || g.teams.away.id === teamId)
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
      return games;
    });
  }

  async getHeadToHead(league: string, teamId: number, opponentId: number, options: { limit?: number } = {}) {
    if (this.isTpbl(league)) return this.tpbl.getHeadToHead(teamId, opponentId, options.limit ?? 10);
    const cfg = this.getLeagueConfig(league);
    if (!cfg) return { games: [], summary: { total: 0, teamWins: 0, opponentWins: 0 } };

    const limit = options.limit ?? 10;
    const cacheKey = `basketball:${league}:h2h:${teamId}:${opponentId}:${limit}`;
    const result = await this.cached(cacheKey, 3600, async () => {
      const games = await this.callApi<any[]>('/games/h2h', {
        h2h: `${teamId}-${opponentId}`,
        league: cfg.leagueId,
        season: cfg.season,
      });
      if (!games || !Array.isArray(games)) return null;

      const finished = games.filter((g) => ['FT', 'AOT'].includes(g.status?.short));
      finished.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
      const recent = finished.slice(0, limit);
      const normalized = await this.normalizeAndTranslate(recent, league);

      let teamWins = 0;
      let opponentWins = 0;
      for (const g of normalized) {
        const isHome = g.teams.home.id === teamId;
        const my = isHome ? g.teams.home.score : g.teams.away.score;
        const opp = isHome ? g.teams.away.score : g.teams.home.score;
        if (my == null || opp == null) continue;
        if (my > opp) teamWins++;
        else if (opp > my) opponentWins++;
      }
      return { games: normalized, summary: { total: normalized.length, teamWins, opponentWins } };
    });
    return result ?? { games: [], summary: { total: 0, teamWins: 0, opponentWins: 0 } };
  }

  async getTeamOverview(league: string, teamId: number) {
    if (this.isTpbl(league)) return this.tpbl.getTeamOverview(teamId);
    const [teams, recentGames, standings] = await Promise.all([
      this.getTeams(league),
      this.getTeamRecentGames(league, teamId, 30),
      this.getStandings(league),
    ]);
    const team = (teams as any[])?.find((t) => t.id === teamId) ?? null;
    return { team, recentGames, standings: standings ?? [] };
  }

  // ============ 內部工具 ============

  private async normalizeAndTranslate(
    games: ApiSportsBasketballGame[],
    league: string,
  ): Promise<NormalizedBasketballGame[]> {
    const teamIds = new Set<number>();
    for (const g of games) {
      if (g.teams?.home?.id) teamIds.add(g.teams.home.id);
      if (g.teams?.away?.id) teamIds.add(g.teams.away.id);
    }
    const trMap = await this.getTeamTranslations(Array.from(teamIds));

    return games.map((g) => {
      const homeTr = trMap.get(g.teams.home.id);
      const awayTr = trMap.get(g.teams.away.id);
      return {
        id: g.id,
        league,
        date: g.date,
        timestamp: g.timestamp,
        status: g.status?.long ?? 'Unknown',
        statusShort: g.status?.short ?? '?',
        stage: g.stage ?? null,
        venue: g.venue ?? null,
        teams: {
          home: {
            id: g.teams.home.id,
            name: g.teams.home.name,
            nameZhTw: homeTr?.nameZhTw,
            shortName: homeTr?.shortName,
            logo: g.teams.home.logo,
            score: g.scores?.home?.total ?? null,
          },
          away: {
            id: g.teams.away.id,
            name: g.teams.away.name,
            nameZhTw: awayTr?.nameZhTw,
            shortName: awayTr?.shortName,
            logo: g.teams.away.logo,
            score: g.scores?.away?.total ?? null,
          },
        },
        scores: g.scores,
      };
    });
  }
}
