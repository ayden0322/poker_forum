import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../common/redis.service';
import { SPORT_CONFIG, SportType, CACHE_TTL } from './sports.config';

@Injectable()
export class SportsService {
  private readonly logger = new Logger(SportsService.name);
  private readonly apiKey: string;

  constructor(
    private config: ConfigService,
    private redis: RedisService,
  ) {
    this.apiKey = this.config.get<string>('API_SPORTS_KEY', '');
    if (!this.apiKey) {
      this.logger.warn('API_SPORTS_KEY 未設定，體育賽事 API 將無法使用');
    }
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

      const data = await res.json() as { response: T };
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

  // ============ 即時比分 / 今日賽程 ============

  /** 取得今日賽事（含即時比分） */
  async getLiveGames(sport: SportType) {
    const cfg = SPORT_CONFIG[sport];
    const today = this.getDateString();
    const cacheKey = `sports:${sport}:games:${today}`;

    return this.cachedCall(cacheKey, CACHE_TTL.LIVE, async () => {
      if (sport === 'soccer') {
        return this.callApi(cfg.apiHost, '/fixtures', {
          league: cfg.leagueId,
          season: cfg.season,
          date: today,
        });
      }
      // basketball & baseball 使用 /games endpoint
      return this.callApi(cfg.apiHost, '/games', {
        league: cfg.leagueId,
        season: cfg.season,
        date: today,
      });
    });
  }

  // ============ 賽程 ============

  /** 取得近期賽程（未來 7 天） */
  async getSchedule(sport: SportType) {
    const cfg = SPORT_CONFIG[sport];
    const today = this.getDateString();
    const nextWeek = this.getDateString(7);
    const cacheKey = `sports:${sport}:schedule:${today}`;

    return this.cachedCall(cacheKey, CACHE_TTL.SCHEDULE, async () => {
      if (sport === 'soccer') {
        return this.callApi(cfg.apiHost, '/fixtures', {
          league: cfg.leagueId,
          season: cfg.season,
          from: today,
          to: nextWeek,
        });
      }
      // basketball & baseball
      return this.callApi(cfg.apiHost, '/games', {
        league: cfg.leagueId,
        season: cfg.season,
        date: today, // API-Sports basketball/baseball 用 date 查單日
      });
    });
  }

  // ============ 排名 ============

  async getStandings(sport: SportType) {
    const cfg = SPORT_CONFIG[sport];
    const cacheKey = `sports:${sport}:standings:${cfg.season}`;

    return this.cachedCall(cacheKey, CACHE_TTL.STANDINGS, async () => {
      if (sport === 'soccer') {
        return this.callApi(cfg.apiHost, '/standings', {
          league: cfg.leagueId,
          season: cfg.season,
        });
      }
      return this.callApi(cfg.apiHost, '/standings', {
        league: cfg.leagueId,
        season: cfg.season,
      });
    });
  }

  // ============ 球員數據 ============

  async getPlayers(sport: SportType, teamId?: number) {
    const cfg = SPORT_CONFIG[sport];
    const cacheKey = `sports:${sport}:players:${teamId ?? 'all'}`;

    return this.cachedCall(cacheKey, CACHE_TTL.PLAYERS, async () => {
      const params: Record<string, string | number> = {
        league: cfg.leagueId,
        season: cfg.season,
      };
      if (teamId) params.team = teamId;

      if (sport === 'soccer') {
        return this.callApi(cfg.apiHost, '/players', params);
      }
      // basketball / baseball 的 players endpoint 略有不同
      return this.callApi(cfg.apiHost, '/players', params);
    });
  }

  // ============ 賠率（僅足球有） ============

  async getOdds(sport: SportType, fixtureId?: number) {
    if (sport !== 'soccer') return null;

    const cfg = SPORT_CONFIG[sport];
    const cacheKey = `sports:${sport}:odds:${fixtureId ?? 'latest'}`;

    return this.cachedCall(cacheKey, CACHE_TTL.ODDS, async () => {
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
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  }
}
