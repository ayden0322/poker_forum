import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * NBA 資料服務（雙來源：ESPN + cdn.nba.com）
 *
 * - ESPN（site.api.espn.com）：排行、陣容、球員生涯、比賽 summary
 * - cdn.nba.com：即時計分板、Box Score、Play-by-play、整季賽程
 *
 * 兩者都免 API Key、免 referer。Redis 快取降低請求頻率。
 */
@Injectable()
export class NBAStatsService {
  private readonly logger = new Logger(NBAStatsService.name);

  private readonly espnSite = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
  private readonly espnSiteV2 = 'https://site.api.espn.com/apis/v2/sports/basketball/nba';
  private readonly espnWeb = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
  private readonly nbaCdn = 'https://cdn.nba.com/static/json';

  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** 通用 fetcher */
  private async callApi<T>(url: string): Promise<T | null> {
    this.logger.debug(`NBA API 呼叫：${url}`);
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        this.logger.error(`NBA API ${res.status}：${url}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      this.logger.error(`NBA API 失敗：${err}`);
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

  /** 取得 ESPN 全 30 支球隊 */
  async getAllTeams() {
    return this.cached('nba:espn:teams', 86400, async () => {
      const data = await this.callApi<any>(`${this.espnSite}/teams`);
      // ESPN 的 teams 結構：sports[0].leagues[0].teams[].team
      const teams = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
      return teams.map((t: any) => t.team);
    });
  }

  /** 取得單一球隊基本資料 */
  async getTeam(espnTeamId: number) {
    return this.cached(`nba:espn:team:${espnTeamId}`, 86400, async () => {
      const data = await this.callApi<any>(`${this.espnSite}/teams/${espnTeamId}`);
      return data?.team ?? null;
    });
  }

  // ============ 陣容 ============

  /** 取得球隊陣容（含位置、號碼、身高、體重）*/
  async getRoster(espnTeamId: number) {
    return this.cached(`nba:espn:roster:${espnTeamId}`, 3600, async () => {
      const data = await this.callApi<any>(`${this.espnSite}/teams/${espnTeamId}/roster`);
      return data?.athletes ?? [];
    });
  }

  /** 取得球隊賽程（整季，含已打 + 未打）*/
  async getTeamSchedule(espnTeamId: number) {
    return this.cached(`nba:espn:schedule:${espnTeamId}`, 3600, async () => {
      const data = await this.callApi<any>(`${this.espnSite}/teams/${espnTeamId}/schedule`);
      return data?.events ?? [];
    });
  }

  // ============ 排行榜 ============

  /** 取得 NBA 排行榜（東西區） */
  async getStandings() {
    return this.cached('nba:espn:standings', 3600, async () => {
      const data = await this.callApi<any>(`${this.espnSiteV2}/standings`);
      return data ?? null;
    });
  }

  // ============ 球員 ============

  /** 球員基本資料（athletes/:id 回 { athlete, season, ... }） */
  async getPlayer(playerId: number) {
    return this.cached(`nba:espn:player:${playerId}`, 86400, async () => {
      const data = await this.callApi<any>(`${this.espnWeb}/athletes/${playerId}`);
      return data ?? null;
    });
  }

  /** 球員生涯統計 */
  async getPlayerStats(playerId: number) {
    return this.cached(`nba:espn:player:${playerId}:stats`, 3600, async () => {
      const data = await this.callApi<any>(`${this.espnWeb}/athletes/${playerId}/stats`);
      return data ?? null;
    });
  }

  /** 球員逐場 gamelog */
  async getPlayerGamelog(playerId: number) {
    return this.cached(`nba:espn:player:${playerId}:gamelog`, 1800, async () => {
      const data = await this.callApi<any>(`${this.espnWeb}/athletes/${playerId}/gamelog`);
      return data ?? null;
    });
  }

  // ============ 比賽 ============

  /** 比賽 summary（包山包海：boxscore + leaders + seasonseries + injuries + plays + odds）*/
  async getGameSummary(eventId: string) {
    return this.cached(`nba:espn:summary:${eventId}`, 60, async () => {
      const data = await this.callApi<any>(`${this.espnSite}/summary?event=${eventId}`);
      return data ?? null;
    });
  }

  /** 某日 NBA scoreboard（ESPN）*/
  async getScoreboard(yyyymmdd: string) {
    return this.cached(`nba:espn:scoreboard:${yyyymmdd}`, 60, async () => {
      const data = await this.callApi<any>(`${this.espnSite}/scoreboard?dates=${yyyymmdd}`);
      return data?.events ?? [];
    });
  }

  // ============ 數據王 (stats.nba.com) ============

  /**
   * NBA 數據王（PTS / REB / AST / STL / BLK / FG3M / FG_PCT / FT_PCT）
   * stats.nba.com 對伺服器端較挑剔，需要正確的 referer + user-agent
   */
  async getLeaders(category: string, season: string = '2025-26', limit: number = 10) {
    const cacheKey = `nba:stats:leaders:${category}:${season}:${limit}`;
    return this.cached(cacheKey, 21600, async () => {
      const url =
        `https://stats.nba.com/stats/leagueleaders?LeagueID=00&PerMode=PerGame` +
        `&Scope=S&Season=${season}&SeasonType=Regular%20Season&StatCategory=${category}`;
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(15000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Referer: 'https://www.nba.com/',
            Origin: 'https://www.nba.com',
            Accept: 'application/json',
          },
        });
        if (!res.ok) {
          this.logger.error(`stats.nba.com leaders ${res.status}`);
          return null;
        }
        const data = (await res.json()) as any;
        const rs = data?.resultSet ?? {};
        const headers: string[] = rs.headers ?? [];
        const rows: any[][] = rs.rowSet ?? [];
        const idx = (n: string) => headers.indexOf(n);

        return rows.slice(0, limit).map((r) => ({
          rank: r[idx('RANK')],
          playerId: r[idx('PLAYER_ID')],
          playerName: r[idx('PLAYER')],
          teamId: r[idx('TEAM_ID')],
          team: r[idx('TEAM')],
          gp: r[idx('GP')],
          value: r[idx(category.toUpperCase())] ?? r[idx(category)],
          pts: r[idx('PTS')],
          reb: r[idx('REB')],
          ast: r[idx('AST')],
        }));
      } catch (err) {
        this.logger.error(`stats.nba.com leaders 失敗：${err}`);
        return null;
      }
    });
  }

  // ============ 傷兵 ============

  /** 全聯盟傷兵列表 */
  async getInjuries() {
    return this.cached('nba:espn:injuries', 1800, async () => {
      const data = await this.callApi<any>(`${this.espnSite}/injuries`);
      return data?.injuries ?? [];
    });
  }

  // ============ cdn.nba.com（補強）============

  /** 今日即時計分板（最即時，每場含 period/clock/score）*/
  async getTodayScoreboard() {
    return this.cached('nba:cdn:scoreboard:today', 30, async () => {
      const data = await this.callApi<any>(`${this.nbaCdn}/liveData/scoreboard/todaysScoreboard_00.json`);
      return data?.scoreboard ?? null;
    });
  }

  /** 整季賽程（1300+ 場含未開打）*/
  async getLeagueSchedule() {
    return this.cached('nba:cdn:schedule:league', 21600, async () => {
      const data = await this.callApi<any>(`${this.nbaCdn}/staticData/scheduleLeagueV2.json`);
      return data?.leagueSchedule ?? null;
    });
  }

  /** 單場 Box Score（cdn.nba.com，需 NBA 官方 gameId 如 0042500107）*/
  async getCdnBoxScore(nbaGameId: string) {
    return this.cached(`nba:cdn:box:${nbaGameId}`, 60, async () => {
      const data = await this.callApi<any>(`${this.nbaCdn}/liveData/boxscore/boxscore_${nbaGameId}.json`);
      return data?.game ?? null;
    });
  }

  /** 單場 Play-by-play */
  async getCdnPlayByPlay(nbaGameId: string) {
    return this.cached(`nba:cdn:pbp:${nbaGameId}`, 60, async () => {
      const data = await this.callApi<any>(`${this.nbaCdn}/liveData/playbyplay/playbyplay_${nbaGameId}.json`);
      return data?.game ?? null;
    });
  }

  // ============ ID 對應 (API-Sports → ESPN) ============

  /**
   * 把 API-Sports basketball v1 的 gameId 解析為 ESPN eventId
   * 流程：拿 API-Sports game (date + away/home team) → 透過 Translation.extra 取 ESPN abbreviations
   *      → 查 ESPN scoreboard 該日期 → 用 abbreviation 比對得到 eventId
   */
  async resolveApiSportsGameToEspn(apiSportsGameId: number): Promise<string | null> {
    const cacheKey = `nba:resolve:apisports2espn:${apiSportsGameId}`;
    const cached = await this.redis.get<string>(cacheKey);
    if (cached) return cached;

    const apiKey = this.config.get<string>('API_SPORTS_KEY');
    if (!apiKey) return null;

    try {
      // 1. 拿 API-Sports game
      const res = await fetch(
        `https://v1.basketball.api-sports.io/games?id=${apiSportsGameId}`,
        { headers: { 'x-apisports-key': apiKey }, signal: AbortSignal.timeout(10000) },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { response: any[] };
      const g = data.response?.[0];
      if (!g) return null;

      const date = g.date?.slice(0, 10); // YYYY-MM-DD
      if (!date) return null;
      const awayApiId = g.teams?.away?.id;
      const homeApiId = g.teams?.home?.id;

      // 2. 從 Translation 找 ESPN abbreviations
      const trs = await this.prisma.translation.findMany({
        where: { entityType: 'team', sport: 'basketball', apiId: { in: [awayApiId, homeApiId] } },
      });
      const abbrByApiId = new Map<number, string>();
      for (const t of trs) {
        const e = (t.extra as any) ?? {};
        if (e.espnAbbr) abbrByApiId.set(t.apiId, e.espnAbbr);
      }
      const awayAbbr = abbrByApiId.get(awayApiId);
      const homeAbbr = abbrByApiId.get(homeApiId);
      if (!awayAbbr || !homeAbbr) return null;

      // 3. 查 ESPN scoreboard — 嘗試該日期 ±1 天（API-Sports 用 UTC，ESPN 用美東時間，可能跨日）
      const baseDate = new Date(date + 'T12:00:00Z');
      const candidates: string[] = [];
      for (const offset of [0, -1, 1]) {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + offset);
        candidates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
      }
      for (const yyyymmdd of candidates) {
        const events = await this.getScoreboard(yyyymmdd);
        for (const ev of events ?? []) {
          const comps = ev.competitions?.[0]?.competitors ?? [];
          const a = comps.find((c: any) => c.homeAway === 'away')?.team?.abbreviation;
          const h = comps.find((c: any) => c.homeAway === 'home')?.team?.abbreviation;
          if (a === awayAbbr && h === homeAbbr) {
            await this.redis.set(cacheKey, ev.id, 86400);
            return ev.id;
          }
        }
      }
      return null;
    } catch (err) {
      this.logger.error(`resolve API-Sports → ESPN 失敗：${err}`);
      return null;
    }
  }

  // ============ 工具方法 ============

  /** 取得指定日期字串（台灣時區，YYYYMMDD 格式給 ESPN）*/
  getDateYYYYMMDD(offsetDays: number = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  }
}
