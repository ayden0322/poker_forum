import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * MLB 官方 Stats API 包裝服務
 *
 * API 文件：https://statsapi.mlb.com/api/v1/
 * 特色：完全免費、無需 API Key、資料完整
 * Rate Limit：官方未明確規定，透過 Redis 快取降低請求
 */
@Injectable()
export class MLBStatsService {
  private readonly logger = new Logger(MLBStatsService.name);
  private readonly baseUrl = 'https://statsapi.mlb.com/api/v1';

  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  /** 呼叫 MLB API */
  private async callApi<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T | null> {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) query.set(k, String(v));
    const url = `${this.baseUrl}${endpoint}${query.toString() ? '?' + query : ''}`;

    this.logger.debug(`MLB API 呼叫：${url}`);

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        this.logger.error(`MLB API ${res.status}：${await res.text()}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      this.logger.error(`MLB API 失敗：${err}`);
      return null;
    }
  }

  /** 帶快取的呼叫 */
  private async cached<T>(cacheKey: string, ttl: number, fetcher: () => Promise<T | null>): Promise<T | null> {
    const hit = await this.redis.get<T>(cacheKey);
    if (hit) return hit;
    const data = await fetcher();
    if (data) await this.redis.set(cacheKey, data, ttl);
    return data;
  }

  // ============ 球隊 ============

  /** 取得所有 MLB 球隊（30 支）*/
  async getAllTeams(season: number = new Date().getFullYear()) {
    const cacheKey = `mlb:teams:${season}`;
    return this.cached(cacheKey, 86400, async () => {
      const data = await this.callApi<{ teams: any[] }>('/teams', {
        sportId: 1,
        season,
      });
      return data?.teams ?? [];
    });
  }

  /** 取得單一球隊資訊 */
  async getTeam(teamId: number) {
    const cacheKey = `mlb:team:${teamId}`;
    return this.cached(cacheKey, 86400, async () => {
      const data = await this.callApi<{ teams: any[] }>(`/teams/${teamId}`);
      return data?.teams?.[0] ?? null;
    });
  }

  // ============ 陣容 Roster ============

  /** 取得球隊陣容 */
  async getRoster(teamId: number, season: number = new Date().getFullYear()) {
    const cacheKey = `mlb:roster:${teamId}:${season}`;
    return this.cached(cacheKey, 3600, async () => {
      const data = await this.callApi<{ roster: any[] }>(`/teams/${teamId}/roster`, {
        season,
        rosterType: 'active',
      });
      return data?.roster ?? [];
    });
  }

  // ============ 球員 ============

  /** 取得球員基本資料 */
  async getPlayer(playerId: number) {
    const cacheKey = `mlb:player:${playerId}`;
    return this.cached(cacheKey, 86400, async () => {
      const data = await this.callApi<{ people: any[] }>(`/people/${playerId}`);
      return data?.people?.[0] ?? null;
    });
  }

  /** 取得球員賽季統計（打擊） */
  async getPlayerSeasonHitting(playerId: number, season: number = new Date().getFullYear()) {
    const cacheKey = `mlb:player:${playerId}:hitting:${season}`;
    return this.cached(cacheKey, 3600, async () => {
      const data = await this.callApi<{ stats: any[] }>(`/people/${playerId}/stats`, {
        stats: 'season',
        season,
        group: 'hitting',
      });
      return data?.stats?.[0]?.splits?.[0]?.stat ?? null;
    });
  }

  /** 取得球員賽季統計（投球） */
  async getPlayerSeasonPitching(playerId: number, season: number = new Date().getFullYear()) {
    const cacheKey = `mlb:player:${playerId}:pitching:${season}`;
    return this.cached(cacheKey, 3600, async () => {
      const data = await this.callApi<{ stats: any[] }>(`/people/${playerId}/stats`, {
        stats: 'season',
        season,
        group: 'pitching',
      });
      return data?.stats?.[0]?.splits?.[0]?.stat ?? null;
    });
  }

  /** 取得球員生涯統計 */
  async getPlayerCareer(playerId: number, group: 'hitting' | 'pitching' = 'hitting') {
    const cacheKey = `mlb:player:${playerId}:career:${group}`;
    return this.cached(cacheKey, 86400, async () => {
      const data = await this.callApi<{ stats: any[] }>(`/people/${playerId}/stats`, {
        stats: 'career',
        group,
      });
      return data?.stats?.[0]?.splits?.[0]?.stat ?? null;
    });
  }

  // ============ 排行榜 ============

  /**
   * 取得排行榜
   * @param category 類別：
   *   打擊類：homeRuns, battingAverage, runsBattedIn, hits, onBasePercentage, sluggingPercentage, stolenBases
   *   投手類：earnedRunAverage, strikeouts, wins, saves, whip
   * @param season 賽季
   * @param limit 前幾名
   */
  async getLeaders(
    category: string,
    season: number = new Date().getFullYear(),
    limit: number = 10,
  ) {
    const cacheKey = `mlb:leaders:${category}:${season}:${limit}`;
    return this.cached(cacheKey, 3600, async () => {
      // 判斷是投手還是打者類別
      const pitchingCats = ['earnedRunAverage', 'strikeouts', 'wins', 'saves', 'whip', 'holds'];
      const statGroup = pitchingCats.includes(category) ? 'pitching' : 'hitting';

      const data = await this.callApi<{ leagueLeaders: any[] }>('/stats/leaders', {
        leaderCategories: category,
        season,
        sportId: 1,
        statGroup,
        limit,
      });
      return data?.leagueLeaders?.[0]?.leaders ?? [];
    });
  }

  // ============ 賽程 ============

  /** 取得指定日期的比賽 */
  async getSchedule(date: string) {
    const cacheKey = `mlb:schedule:${date}`;
    return this.cached(cacheKey, 300, async () => {
      const data = await this.callApi<{ dates: any[] }>('/schedule', {
        sportId: 1,
        date,
      });
      return data?.dates?.[0]?.games ?? [];
    });
  }

  // ============ 單場比賽詳情（含逐球資料） ============

  async getGameFeed(gamePk: number) {
    const cacheKey = `mlb:game:${gamePk}`;
    return this.cached(cacheKey, 60, async () => {
      // 這個 endpoint 在另一個 path
      try {
        const res = await fetch(
          `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`,
          { signal: AbortSignal.timeout(15000) },
        );
        if (!res.ok) return null;
        return await res.json();
      } catch (err) {
        this.logger.error(`取得比賽詳情失敗：${err}`);
        return null;
      }
    });
  }

  /** Box Score（簡化版戰報） */
  async getBoxScore(gamePk: number) {
    const cacheKey = `mlb:boxscore:${gamePk}`;
    return this.cached(cacheKey, 60, async () => {
      return this.callApi(`/game/${gamePk}/boxscore`);
    });
  }

  /** Line Score（逐局比分） */
  async getLineScore(gamePk: number) {
    const cacheKey = `mlb:linescore:${gamePk}`;
    return this.cached(cacheKey, 60, async () => {
      return this.callApi(`/game/${gamePk}/linescore`);
    });
  }

  // ============ 傷兵與交易 ============

  /** 取得近期交易 / 傷兵紀錄（只過濾 MLB 層級） */
  async getTransactions(startDate: string, endDate: string) {
    const cacheKey = `mlb:transactions:${startDate}:${endDate}`;
    return this.cached(cacheKey, 3600, async () => {
      const data = await this.callApi<{ transactions: any[] }>('/transactions', {
        startDate,
        endDate,
      });
      // 只保留 MLB 隊伍的交易（小聯盟排除）
      const MLB_TEAM_IDS = new Set([
        108, 109, 110, 111, 112, 113, 114, 115, 116, 117,
        118, 119, 120, 121, 133, 134, 135, 136, 137, 138,
        139, 140, 141, 142, 143, 144, 145, 146, 147, 158,
      ]);
      return (data?.transactions ?? []).filter(
        (t: any) => MLB_TEAM_IDS.has(t.fromTeam?.id) || MLB_TEAM_IDS.has(t.toTeam?.id),
      );
    });
  }

  // ============ 球隊 ID 對應工具 ============

  /** 透過 API-Sports Team ID 找 MLB 官方 Team ID */
  async getMlbTeamIdByApiSportsId(apiSportsTeamId: number): Promise<number | null> {
    const cacheKey = `mlb:id-map:apisports:${apiSportsTeamId}`;
    const cached = await this.redis.get<number>(cacheKey);
    if (cached) return cached;

    const translation = await this.prisma.translation.findFirst({
      where: {
        entityType: 'team',
        sport: 'baseball',
        apiId: apiSportsTeamId,
      },
      select: { extra: true },
    });

    const mlbId = (translation?.extra as any)?.mlbStatsTeamId;
    if (mlbId) {
      await this.redis.set(cacheKey, mlbId, 86400);
      return mlbId;
    }
    return null;
  }
}
