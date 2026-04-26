import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis.service';
import { PrismaService } from '../../common/prisma.service';
import { LEAGUE_CONFIG, CACHE_TTL } from '../sports.config';
import {
  BaseballLeague,
  BASEBALL_LEAGUES,
  LEAGUE_TIMEZONE,
  NormalizedGame,
  ApiSportsBaseballGame,
} from './baseball-common.types';

/**
 * 通用棒球服務（CPBL / NPB / KBO）
 *
 * 資料來源：API-Sports Baseball v1
 * 策略：免費方案只帶 date 查詢，後端用 leagueId 過濾
 */
@Injectable()
export class BaseballCommonService {
  private readonly logger = new Logger(BaseballCommonService.name);
  private readonly apiKey: string;

  constructor(
    private config: ConfigService,
    private redis: RedisService,
    private prisma: PrismaService,
  ) {
    this.apiKey = this.config.get<string>('API_SPORTS_KEY', '');
  }

  /** 驗證聯賽 slug 是否有效 */
  isValidLeague(league: string): league is BaseballLeague {
    return (BASEBALL_LEAGUES as readonly string[]).includes(league);
  }

  /** 取得聯賽設定 */
  private getLeagueConfig(league: BaseballLeague) {
    return LEAGUE_CONFIG[league];
  }

  // ============ API-Sports 通用呼叫 ============

  private async callApi<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T | null> {
    const host = 'v1.baseball.api-sports.io';
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) query.set(k, String(v));
    const url = `https://${host}${endpoint}?${query.toString()}`;

    this.logger.debug(`Baseball API 呼叫：${url}`);

    try {
      const res = await fetch(url, {
        headers: { 'x-apisports-key': this.apiKey },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        this.logger.error(`Baseball API ${res.status}：${await res.text()}`);
        return null;
      }
      const data = await res.json() as { response: T; errors: Record<string, string> };
      if (data.errors && Object.keys(data.errors).length > 0) {
        this.logger.warn(`Baseball API 警告：${JSON.stringify(data.errors)}`);
      }
      return data.response;
    } catch (err) {
      this.logger.error(`Baseball API 失敗：${err}`);
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
      where: { entityType: 'team', sport: 'baseball', apiId: { in: teamIds } },
      select: { apiId: true, nameZhTw: true, shortName: true },
    });
    return new Map(translations.map((t) => [t.apiId, { nameZhTw: t.nameZhTw, shortName: t.shortName }]));
  }

  // ============ 比賽資料（核心） ============

  /**
   * 取得指定日期的比賽
   * 免費方案策略：只帶 date 查詢，後端過濾 leagueId
   */
  async getGamesByDate(league: BaseballLeague, date: string): Promise<NormalizedGame[]> {
    const cfg = this.getLeagueConfig(league);
    if (!cfg) return [];

    const cacheKey = `baseball:${league}:games:${date}`;
    const ttl = CACHE_TTL.LIVE;

    const games = await this.cached<NormalizedGame[]>(cacheKey, ttl, async () => {
      // 共用快取：同一天的所有棒球比賽
      const allCacheKey = `baseball:allgames:${date}`;
      let allGames = await this.redis.get<ApiSportsBaseballGame[]>(allCacheKey);

      if (!allGames) {
        allGames = await this.callApi<ApiSportsBaseballGame[]>('/games', { date });
        if (allGames) {
          await this.redis.set(allCacheKey, allGames, ttl);
        }
      }

      if (!allGames || !Array.isArray(allGames)) return [];

      // 過濾指定聯賽
      const filtered = allGames.filter((g) => g.league?.id === cfg.leagueId);

      // 正規化 + 翻譯
      return this.normalizeAndTranslate(filtered, league);
    });

    return games ?? [];
  }

  /**
   * 台灣時區視角的三日賽事（昨日 / 今日 / 明日）
   */
  async getRecentGamesTw(league: BaseballLeague) {
    const twNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const yesterday = new Date(twNow);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(twNow);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [yGames, tGames, tmGames] = await Promise.all([
      this.getGamesByDate(league, fmt(yesterday)),
      this.getGamesByDate(league, fmt(twNow)),
      this.getGamesByDate(league, fmt(tomorrow)),
    ]);

    return {
      yesterday: yGames,
      today: tGames,
      tomorrow: tmGames,
    };
  }

  /**
   * 台灣時區的當日賽程
   * CPBL 不需轉換（已是 UTC+8），NPB/KBO 差 1 小時需過濾
   */
  async getScheduleTw(league: BaseballLeague, twDate?: string) {
    if (!twDate) {
      const tw = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
      twDate = tw.toISOString().slice(0, 10);
    }

    const tz = LEAGUE_TIMEZONE[league];

    // CPBL 和台灣同時區，直接查當天
    if (tz === 'Asia/Taipei') {
      return this.getGamesByDate(league, twDate);
    }

    // NPB / KBO (UTC+9)：台灣日期可能跨原產地日期
    // 台灣 00:00 = 日本/韓國 01:00，差距很小
    // 查當天即可，邊界情況極少（凌晨 0-1 點不會有比賽）
    return this.getGamesByDate(league, twDate);
  }

  // ============ 排名 ============

  async getStandings(league: BaseballLeague) {
    const cfg = this.getLeagueConfig(league);
    if (!cfg) return [];

    const cacheKey = `baseball:${league}:standings:${cfg.season}`;
    return this.cached(cacheKey, CACHE_TTL.STANDINGS, async () => {
      return this.callApi('/standings', {
        league: cfg.leagueId,
        season: cfg.season,
      });
    });
  }

  // ============ 球隊 ============

  async getTeams(league: BaseballLeague) {
    const cfg = this.getLeagueConfig(league);
    if (!cfg) return [];

    const cacheKey = `baseball:${league}:teams:${cfg.season}`;
    return this.cached(cacheKey, 86400, async () => {
      const teams = await this.callApi<any[]>('/teams', {
        league: cfg.leagueId,
        season: cfg.season,
      });
      if (!teams) return [];

      // 附加翻譯
      const teamIds = teams.map((t) => t.id).filter(Boolean);
      const trMap = await this.getTeamTranslations(teamIds);

      return teams.map((t) => {
        const tr = trMap.get(t.id);
        return {
          ...t,
          nameZhTw: tr?.nameZhTw ?? t.name,
          shortName: tr?.shortName,
        };
      });
    });
  }

  // ============ 球員 ============

  async getPlayers(league: BaseballLeague, teamId?: number) {
    const cfg = this.getLeagueConfig(league);
    if (!cfg) return [];

    const cacheKey = `baseball:${league}:players:${teamId ?? 'all'}`;
    return this.cached(cacheKey, CACHE_TTL.PLAYERS, async () => {
      const params: Record<string, string | number> = {
        league: cfg.leagueId,
        season: cfg.season,
      };
      if (teamId) params.team = teamId;
      return this.callApi('/players', params);
    });
  }

  // ============ 單場比賽資料 ============

  async getGame(gameId: number) {
    const cacheKey = `baseball:game:${gameId}`;
    return this.cached(cacheKey, CACHE_TTL.LIVE, async () => {
      const games = await this.callApi<any[]>('/games', { id: gameId });
      return games?.[0] ?? null;
    });
  }

  // ============ 球隊近期賽事（用於球隊頁 Tab） ============

  /**
   * 球隊近 N 天的賽事
   *
   * 注意：API-Sports 不支援 date range，需逐日查詢。
   * 為避免衝撞 rate limit（100/min 免費方案），改為「先看快取，無快取再串行查詢」，
   * 並限制最多查 7 天。
   */
  async getTeamRecentGames(league: BaseballLeague, teamId: number, days = 7) {
    const cfg = this.getLeagueConfig(league);
    if (!cfg) return [];

    const safeDays = Math.min(days, 7);
    const cacheKey = `baseball:${league}:team:${teamId}:recent:${safeDays}`;
    return this.cached(cacheKey, 600, async () => {
      const tw = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
      const dates: string[] = [];
      for (let i = 0; i < safeDays; i++) {
        const d = new Date(tw);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
      }

      // 串行查詢（避免併發超過 rate limit），享受全聯盟共用快取
      const allDays: NormalizedGame[][] = [];
      for (const d of dates) {
        const games = await this.getGamesByDate(league, d).catch(() => [] as NormalizedGame[]);
        allDays.push(games);
      }

      const games = allDays
        .flat()
        .filter((g) => g.teams?.home?.id === teamId || g.teams?.away?.id === teamId);

      games.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
      return games;
    });
  }

  // ============ 球隊歷史對戰 ============

  /**
   * 兩隊歷史對戰（近 N 場已結束比賽）
   * API-Sports h2h 格式：用 GET /games/h2h?h2h={team1}-{team2}&league={leagueId}&season={season}
   */
  async getHeadToHead(
    league: BaseballLeague,
    teamId: number,
    opponentId: number,
    options: { limit?: number } = {},
  ) {
    const cfg = this.getLeagueConfig(league);
    if (!cfg) return { games: [], summary: { total: 0, teamWins: 0, opponentWins: 0 } };

    const limit = options.limit ?? 10;
    const cacheKey = `baseball:${league}:h2h:${teamId}:${opponentId}:${limit}`;

    const result = await this.cached(cacheKey, 3600, async () => {
      const games = await this.callApi<any[]>('/games/h2h', {
        h2h: `${teamId}-${opponentId}`,
        league: cfg.leagueId,
        season: cfg.season,
      });

      if (!games || !Array.isArray(games)) return null;

      // 只取已結束的比賽
      const finished = games.filter((g) =>
        ['FT', 'AOT', 'POST'].includes(g.status?.short),
      );

      finished.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
      const recent = finished.slice(0, limit);

      // 翻譯隊名
      const normalized = await this.normalizeAndTranslate(recent, league);

      // 計算戰績
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

      return {
        games: normalized,
        summary: { total: normalized.length, teamWins, opponentWins },
      };
    });

    return result ?? { games: [], summary: { total: 0, teamWins: 0, opponentWins: 0 } };
  }

  // ============ 球隊 overview（聚合資料） ============

  /**
   * 球隊完整資料一次拉
   * 用於球隊頁減少 N 個 API 往返
   */
  async getTeamOverview(league: BaseballLeague, teamId: number) {
    const [teams, recentGames, standings] = await Promise.all([
      this.getTeams(league),
      this.getTeamRecentGames(league, teamId, 14),
      this.getStandings(league),
    ]);

    const team = teams?.find((t) => t.id === teamId) ?? null;

    return {
      team,
      recentGames,
      standings: standings ?? [],
    };
  }

  // ============ 內部工具 ============

  /** 正規化 API-Sports 資料 + 附加中文翻譯 */
  private async normalizeAndTranslate(
    games: ApiSportsBaseballGame[],
    league: BaseballLeague,
  ): Promise<NormalizedGame[]> {
    // 收集所有隊伍 ID
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
