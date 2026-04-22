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

  /** 取得指定日期的比賽（MLB 美東日期） */
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

  /**
   * 以「台灣日期」取得賽程
   * 一個台灣日可能橫跨 2 個 MLB 美東日期，所以查詢 startDate~endDate 範圍
   * 再用 Taiwan 時區過濾開打時間落在該台灣日的比賽
   * 同時包含即時比分（linescore.currentInning/inningState）
   *
   * @param twDate 台灣日期 YYYY-MM-DD
   */
  async getScheduleByTaiwanDate(twDate: string) {
    const cacheKey = `mlb:schedule:tw:${twDate}`;
    // TTL 30 秒，配合前端 10 秒輪詢（快取命中時只壓 MLB API 每 30 秒一次）
    return this.cached(cacheKey, 30, async () => {
      // 台灣一天的 UTC 範圍
      // Taiwan 00:00 = UTC 前一日 16:00
      // Taiwan 23:59 = UTC 當日 15:59
      const [y, m, d] = twDate.split('-').map(Number);
      const startTwUtc = new Date(Date.UTC(y, m - 1, d) - 8 * 3600 * 1000); // 台灣當日 00:00 的 UTC
      const endTwUtc = new Date(startTwUtc.getTime() + 24 * 3600 * 1000); // +24h

      // 查 MLB 美東日期：從 startTwUtc 前一天到當天，覆蓋所有可能的比賽
      const etStart = new Date(startTwUtc);
      etStart.setUTCDate(etStart.getUTCDate() - 1);
      const etEnd = new Date(endTwUtc);

      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      // 用 startDate/endDate 範圍查（MLB API 支援），含即時比分
      const data = await this.callApi<{ dates: any[] }>('/schedule', {
        sportId: 1,
        startDate: fmt(etStart),
        endDate: fmt(etEnd),
        hydrate: 'linescore',
      });

      const allGames = (data?.dates ?? []).flatMap((dd: any) => dd.games ?? []);

      // 過濾：開打時間（UTC）落在台灣當日範圍內的比賽
      return allGames.filter((g: any) => {
        if (!g.gameDate) return false;
        const gameTime = new Date(g.gameDate).getTime();
        return gameTime >= startTwUtc.getTime() && gameTime < endTwUtc.getTime();
      });
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

  // ============ 球隊統計 ============

  /** 球隊賽季統計（打擊 + 投手） */
  async getTeamStats(teamId: number, season: number = new Date().getFullYear()) {
    const cacheKey = `mlb:team:${teamId}:stats:${season}`;
    return this.cached(cacheKey, 3600, async () => {
      const data = await this.callApi<{ stats: any[] }>(`/teams/${teamId}/stats`, {
        stats: 'season',
        season,
        group: 'hitting,pitching',
      });
      const result: { hitting?: any; pitching?: any } = {};
      for (const s of data?.stats ?? []) {
        const group = s.group?.displayName;
        const stat = s.splits?.[0]?.stat;
        if (group && stat) result[group as 'hitting' | 'pitching'] = stat;
      }
      return result;
    });
  }

  /** 球隊近期比賽（指定天數） */
  async getTeamRecentGames(teamId: number, days: number = 14) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const cacheKey = `mlb:team:${teamId}:recent:${startDate}:${endDate}`;
    return this.cached(cacheKey, 600, async () => {
      const data = await this.callApi<{ dates: any[] }>('/schedule', {
        sportId: 1,
        teamId,
        startDate,
        endDate,
      });
      return data?.dates?.flatMap((d) => d.games) ?? [];
    });
  }

  /**
   * 兩隊歷史對戰
   *
   * 注意：MLB Stats API 的 /schedule 端點傳入 startDate/endDate 時，
   * 實際上只會回傳 startDate 那一年的資料，無法跨賽季查詢。
   * 因此必須逐年（season 參數）查詢再合併。
   */
  async getHeadToHead(
    teamId: number,
    opponentId: number,
    options: { years?: number; limit?: number } = {},
  ) {
    const years = options.years ?? 3;
    const limit = options.limit ?? 20;
    const currentYear = new Date().getFullYear();
    // 從當年度往前回溯 N 年，例如 2026 + years=3 → [2026, 2025, 2024, 2023]
    const seasons = Array.from({ length: years + 1 }, (_, i) => currentYear - i);

    const cacheKey = `mlb:h2h:${teamId}:${opponentId}:${seasons.join(',')}:${limit}`;
    return this.cached(cacheKey, 3600, async () => {
      // 平行查詢各賽季，單一賽季失敗不影響其他賽季
      const results = await Promise.all(
        seasons.map((season) =>
          this.callApi<{ dates: any[] }>('/schedule', {
            sportId: 1,
            teamId,
            opponentId,
            season,
          }).catch(() => ({ dates: [] as any[] })),
        ),
      );

      const games = results.flatMap((r) => r?.dates?.flatMap((d) => d.games) ?? []);

      // 按日期倒序，只取 limit 場已結束的
      return games
        .filter((g: any) => g.status?.detailedState === 'Final')
        .sort((a: any, b: any) => b.officialDate.localeCompare(a.officialDate))
        .slice(0, limit);
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
