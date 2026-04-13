import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../common/redis.service';
import { PrismaService } from '../common/prisma.service';
import { LEAGUE_CONFIG, SportType, CACHE_TTL } from './sports.config';

interface LeagueDbConfig {
  boardSlug: string;
  sportType: SportType;
  displayName: string;
  enabled: boolean;
  apiHost: string;
  leagueId: number;
  season: string;
  cacheTtl: Record<string, number>;
}

@Injectable()
export class SportsService {
  private readonly logger = new Logger(SportsService.name);
  private readonly apiKey: string;

  constructor(
    private config: ConfigService,
    private redis: RedisService,
    private prisma: PrismaService,
  ) {
    this.apiKey = this.config.get<string>('API_SPORTS_KEY', '');
    if (!this.apiKey) {
      this.logger.warn('API_SPORTS_KEY 未設定，體育賽事 API 將無法使用');
    }
  }

  /** 從資料庫取得設定，fallback 到程式碼預設值 */
  private async getConfig(boardSlug: string): Promise<LeagueDbConfig | null> {
    const dbConfig = await this.prisma.sportsConfig.findUnique({
      where: { boardSlug },
    });

    if (dbConfig) {
      if (!dbConfig.enabled) return null;
      return {
        boardSlug: dbConfig.boardSlug,
        sportType: dbConfig.sportType as SportType,
        displayName: dbConfig.displayName,
        enabled: dbConfig.enabled,
        apiHost: dbConfig.apiHost,
        leagueId: dbConfig.leagueId,
        season: dbConfig.season,
        cacheTtl: (dbConfig.cacheTtl as Record<string, number>) ?? {},
      };
    }

    const fallback = LEAGUE_CONFIG[boardSlug];
    if (!fallback) return null;
    return {
      boardSlug,
      sportType: fallback.sportType,
      displayName: fallback.displayName,
      enabled: true,
      apiHost: fallback.apiHost,
      leagueId: fallback.leagueId,
      season: String(fallback.season),
      cacheTtl: {},
    };
  }

  private getTtl(cfg: LeagueDbConfig, key: keyof typeof CACHE_TTL): number {
    return cfg.cacheTtl[key.toLowerCase()] ?? CACHE_TTL[key];
  }

  /** 呼叫 API-Sports */
  private async callApi<T>(host: string, endpoint: string, params: Record<string, string | number> = {}): Promise<T | null> {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      query.set(k, String(v));
    }

    const url = `https://${host}${endpoint}?${query.toString()}`;
    this.logger.debug(`API-Sports 呼叫：${url}`);

    try {
      const res = await fetch(url, {
        headers: {
          'x-apisports-key': this.apiKey,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        this.logger.error(`API-Sports 回傳 ${res.status}：${await res.text()}`);
        return null;
      }

      const data = await res.json() as { response: T; errors: Record<string, string> };

      if (data.errors && Object.keys(data.errors).length > 0) {
        this.logger.warn(`API-Sports 警告：${JSON.stringify(data.errors)}`);
      }

      return data.response;
    } catch (err) {
      this.logger.error(`API-Sports 呼叫失敗：${err}`);
      return null;
    }
  }

  /** 帶 Redis 快取的 API 呼叫 */
  private async cachedCall<T>(cacheKey: string, ttl: number, fetcher: () => Promise<T | null>): Promise<T | null> {
    const cached = await this.redis.get<T>(cacheKey);
    if (cached) {
      this.logger.debug(`快取命中：${cacheKey}`);
      return cached;
    }

    const data = await fetcher();
    if (data) {
      await this.redis.set(cacheKey, data, ttl);
    }
    return data;
  }

  /** 以 apiTeamId 查詢隊伍中文名稱 */
  private async getTeamTranslations(teamIds: number[]): Promise<Map<number, { nameZhTw: string; shortName: string | null }>> {
    if (teamIds.length === 0) return new Map();

    const translations = await this.prisma.teamTranslation.findMany({
      where: { apiTeamId: { in: teamIds } },
      select: { apiTeamId: true, nameZhTw: true, shortName: true },
    });

    return new Map(translations.map((t) => [t.apiTeamId, { nameZhTw: t.nameZhTw, shortName: t.shortName }]));
  }

  /** 替換 API 回傳的隊伍名稱為中文 */
  private async translateTeamNames(games: any[], sportType: SportType): Promise<any[]> {
    const teamIds = new Set<number>();

    for (const game of games) {
      if (sportType === 'football') {
        if (game.teams?.home?.id) teamIds.add(game.teams.home.id);
        if (game.teams?.away?.id) teamIds.add(game.teams.away.id);
      } else if (sportType === 'basketball') {
        if (game.teams?.home?.id) teamIds.add(game.teams.home.id);
        if (game.teams?.away?.id) teamIds.add(game.teams.away.id);
      } else {
        if (game.teams?.home?.id) teamIds.add(game.teams.home.id);
        if (game.teams?.away?.id) teamIds.add(game.teams.away.id);
      }
    }

    const translations = await this.getTeamTranslations(Array.from(teamIds));
    if (translations.size === 0) return games;

    return games.map((game) => {
      const translated = { ...game };

      const applyTranslation = (teamObj: any) => {
        if (!teamObj?.id) return teamObj;
        const t = translations.get(teamObj.id);
        if (t) {
          return { ...teamObj, name: t.shortName ?? t.nameZhTw };
        }
        return teamObj;
      };

      if (translated.teams) {
        translated.teams = {
          ...translated.teams,
          home: applyTranslation(translated.teams.home),
          away: applyTranslation(translated.teams.away),
        };
      }

      return translated;
    });
  }

  // ============ 即時比分 / 今日賽程 ============
  // 免費方案策略：只帶 date 查詢（不帶 league/season，避免被拒絕）
  // 回傳結果再用 leagueId 後端過濾

  async getLiveGames(boardSlug: string) {
    const cfg = await this.getConfig(boardSlug);
    if (!cfg) return [];

    const today = this.getDateString();
    // 同一個 API host + date 共用快取，避免每個聯賽板各打一次
    const cacheKey = `sports:${cfg.sportType}:allgames:${today}`;

    const allGames = await this.cachedCall<any[]>(cacheKey, this.getTtl(cfg, 'LIVE'), async () => {
      if (cfg.sportType === 'football') {
        // 足球 API 可以帶 league 不帶 season，免費方案可用
        return this.callApi<any[]>(cfg.apiHost, '/fixtures', { league: cfg.leagueId, date: today });
      }
      // 籃球 / 棒球：免費方案只能帶 date，不能帶 league+season
      return this.callApi<any[]>(cfg.apiHost, '/games', { date: today });
    });

    if (!allGames || !Array.isArray(allGames)) return [];

    // 足球已經按 league 過濾了，籃球/棒球需要後端過濾
    const filtered = cfg.sportType === 'football'
      ? allGames
      : allGames.filter((g: any) => g.league?.id === cfg.leagueId);

    return this.translateTeamNames(filtered, cfg.sportType);
  }

  // ============ 賽程 ============

  async getSchedule(boardSlug: string) {
    const cfg = await this.getConfig(boardSlug);
    if (!cfg) return [];

    const today = this.getDateString();
    const cacheKey = `sports:${cfg.sportType}:allschedule:${today}`;

    const allGames = await this.cachedCall<any[]>(cacheKey, this.getTtl(cfg, 'SCHEDULE'), async () => {
      if (cfg.sportType === 'football') {
        return this.callApi<any[]>(cfg.apiHost, '/fixtures', { league: cfg.leagueId, date: today });
      }
      return this.callApi<any[]>(cfg.apiHost, '/games', { date: today });
    });

    if (!allGames || !Array.isArray(allGames)) return [];

    return cfg.sportType === 'football'
      ? allGames
      : allGames.filter((g: any) => g.league?.id === cfg.leagueId);
  }

  // ============ 排名 ============

  async getStandings(boardSlug: string) {
    const cfg = await this.getConfig(boardSlug);
    if (!cfg) return [];

    const cacheKey = `sports:${boardSlug}:standings:${cfg.season}`;

    return this.cachedCall(cacheKey, this.getTtl(cfg, 'STANDINGS'), async () => {
      return this.callApi(cfg.apiHost, '/standings', {
        league: cfg.leagueId,
        season: cfg.season,
      });
    });
  }

  // ============ 球員數據 ============

  async getPlayers(boardSlug: string, teamId?: number) {
    const cfg = await this.getConfig(boardSlug);
    if (!cfg) return [];

    const cacheKey = `sports:${boardSlug}:players:${teamId ?? 'all'}`;

    return this.cachedCall(cacheKey, this.getTtl(cfg, 'PLAYERS'), async () => {
      const params: Record<string, string | number> = {
        league: cfg.leagueId,
        season: cfg.season,
      };
      if (teamId) params.team = teamId;
      return this.callApi(cfg.apiHost, '/players', params);
    });
  }

  // ============ 賠率（僅足球有） ============

  async getOdds(boardSlug: string, fixtureId?: number) {
    const cfg = await this.getConfig(boardSlug);
    if (!cfg || cfg.sportType !== 'football') return null;

    const cacheKey = `sports:${boardSlug}:odds:${fixtureId ?? 'latest'}`;

    return this.cachedCall(cacheKey, this.getTtl(cfg, 'ODDS'), async () => {
      const params: Record<string, string | number> = {
        league: cfg.leagueId,
        season: cfg.season,
      };
      if (fixtureId) params.fixture = fixtureId;
      return this.callApi(cfg.apiHost, '/odds', params);
    });
  }

  // ============ 工具方法 ============

  private getDateString(offsetDays: number = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }
}
