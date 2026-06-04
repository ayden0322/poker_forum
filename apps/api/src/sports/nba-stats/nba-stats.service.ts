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
      // cdn.nba.com / stats.nba.com 對 User-Agent 與 Referer 敏感，
      // 不帶會直接回 403。ESPN 則不需要這些 header。
      const isNba = /\.nba\.com\//.test(url);
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (isNba) {
        headers['User-Agent'] =
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36';
        headers['Referer'] = 'https://www.nba.com/';
        headers['Origin'] = 'https://www.nba.com';
      }
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers,
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

  /**
   * 以「台灣日期」取得 NBA 賽程（ESPN scoreboard 為來源）
   *
   * 一個台灣日（00:00–24:00 Asia/Taipei）對應的 ESPN scoreboard 美東日期可能橫跨 2 個，
   * 因此查 ET±1 共 3 天 scoreboard，再用比賽 ISO 時間落在台灣當日範圍內的條件過濾。
   *
   * @param twDate 台灣日期 YYYY-MM-DD
   */
  async getScheduleByTaiwanDate(twDate: string) {
    const cacheKey = `nba:espn:scoreboard:tw:${twDate}`;
    return this.cached(cacheKey, 30, async () => {
      const [y, m, d] = twDate.split('-').map(Number);
      if (!y || !m || !d) return [];

      // 台灣當日的 UTC 範圍（TW=UTC+8）
      const startUtcMs = Date.UTC(y, m - 1, d) - 8 * 3600 * 1000;
      const endUtcMs = startUtcMs + 24 * 3600 * 1000;

      // ESPN scoreboard 的 dates 參數是美東日；查 ET±1 共 3 天，覆蓋台灣日跨界
      const candidates: string[] = [];
      for (const offset of [-1, 0, 1]) {
        const d2 = new Date(startUtcMs + offset * 86400_000);
        candidates.push(d2.toISOString().slice(0, 10).replace(/-/g, ''));
      }

      const seen = new Set<string>();
      const merged: any[] = [];
      for (const yyyymmdd of candidates) {
        const events = await this.getScoreboard(yyyymmdd);
        for (const ev of events ?? []) {
          if (!ev?.id || seen.has(ev.id)) continue;
          const dateStr: string | undefined = ev.date;
          if (!dateStr) continue;
          const t = new Date(dateStr).getTime();
          if (Number.isNaN(t) || t < startUtcMs || t >= endUtcMs) continue;
          seen.add(ev.id);
          merged.push(ev);
        }
      }
      // 依開打時間遞增排序
      merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return merged;
    });
  }

  // ============ 數據王 (stats.nba.com) ============

  /**
   * NBA 數據王（PTS / REB / AST / STL / BLK / FG3M / FG_PCT / FT_PCT）
   *
   * 容錯策略（stale-while-error）：
   *   1. 命中 fresh cache（6 小時）→ 直接回，最快
   *   2. fresh miss → 打 stats.nba.com，失敗自動 retry 1 次（短延遲）
   *   3. 成功 → 同時寫 fresh（6h）與 stale（7d）兩份
   *   4. 兩次都失敗 → 讀 stale cache（最多 7 天前的資料），標 `_stale: true`
   *   5. 連 stale 都沒有 → 回 null
   *
   * 為什麼這樣設計：stats.nba.com 對 Referer/User-Agent 敏感，會偶發 403/429；
   * Zeabur 大阪節點出口 IP 一旦被風控，整站排行榜不該整片掛掉。
   */
  async getLeaders(category: string, season: string = '2025-26', limit: number = 10) {
    const freshKey = `nba:stats:leaders:${category}:${season}:${limit}`;
    const staleKey = `${freshKey}:stale`;

    const fresh = await this.redis.get<any[]>(freshKey);
    if (fresh) return fresh;

    const url =
      `https://stats.nba.com/stats/leagueleaders?LeagueID=00&PerMode=PerGame` +
      `&Scope=S&Season=${season}&SeasonType=Regular%20Season&StatCategory=${category}`;

    const tryFetch = async (): Promise<any[] | null> => {
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
          this.logger.warn(`stats.nba.com leaders ${res.status}`);
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
        this.logger.warn(`stats.nba.com leaders 失敗：${err}`);
        return null;
      }
    };

    // 第一次嘗試
    let result = await tryFetch();

    // 偶發 429/timeout 給一次補射
    if (!result) {
      await new Promise((r) => setTimeout(r, 800));
      result = await tryFetch();
    }

    if (result) {
      // 同時寫 fresh（6h）與 stale（7d）
      await Promise.all([
        this.redis.set(freshKey, result, 21600),
        this.redis.set(staleKey, result, 7 * 86400),
      ]);
      return result;
    }

    // 全失敗 → 用 stale，標記讓前端可選擇顯示「資料可能延遲」
    const stale = await this.redis.get<any[]>(staleKey);
    if (stale && Array.isArray(stale)) {
      this.logger.warn(`stats.nba.com leaders 全部失敗，回傳 stale 資料 (${category})`);
      return stale.map((row) => ({ ...row, _stale: true }));
    }

    return null;
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

  /** 單場 Box Score（cdn.nba.com，需 NBA 官方 gameId 如 0042500107）
   *  TTL 3s：配合動畫直播 3 秒輪詢，讓進行中比賽的比分/在場球員能即時更新 */
  async getCdnBoxScore(nbaGameId: string) {
    return this.cached(`nba:cdn:box:${nbaGameId}`, 3, async () => {
      const data = await this.callApi<any>(`${this.nbaCdn}/liveData/boxscore/boxscore_${nbaGameId}.json`);
      return data?.game ?? null;
    });
  }

  /** 單場 Play-by-play（TTL 3s：配合動畫直播 3 秒輪詢，事件流即時推進） */
  async getCdnPlayByPlay(nbaGameId: string) {
    return this.cached(`nba:cdn:pbp:${nbaGameId}`, 3, async () => {
      const data = await this.callApi<any>(`${this.nbaCdn}/liveData/playbyplay/playbyplay_${nbaGameId}.json`);
      return data?.game ?? null;
    });
  }

  /**
   * ESPN ↔ NBA tricode alias 表
   *
   * ESPN 對部分球隊用 2 字母縮寫，NBA 官方一律 3 字母。
   * 部分隊伍 ESPN 用「城市完整」（UTAH）或不同字母（WSH vs WAS）。
   */
  private readonly ESPN_TO_NBA_TRICODE: Record<string, string> = {
    SA: 'SAS',
    GS: 'GSW',
    NO: 'NOP',
    NY: 'NYK',
    UTAH: 'UTA',
    WSH: 'WAS',
  };

  /** 正規化 ESPN tricode 為 NBA tricode（其他直接 toUpperCase 後回傳） */
  private normalizeTricode(espnTricode?: string | null): string {
    if (!espnTricode) return '';
    const up = espnTricode.toUpperCase();
    return this.ESPN_TO_NBA_TRICODE[up] ?? up;
  }

  /**
   * ESPN eventId → NBA gameId 解析
   *
   * 流程：
   * 1. 用 ESPN summary 取得 date (UTC) + away/home tricode（含 alias 正規化）
   * 2. 查 cdn schedule v2，用日期 ± 48h + tricode 比對找出 NBA gameId
   * 3. Redis 快取 30 天（mapping 一旦對上不會變）
   */
  async resolveEspnEventToNbaGameId(eventId: string): Promise<string | null> {
    const cacheKey = `nba:resolve:espn2nba:${eventId}`;
    const cached = await this.redis.get<string>(cacheKey);
    if (cached) return cached;

    const summary = await this.getGameSummary(eventId);
    const comp = summary?.header?.competitions?.[0];
    if (!comp) return null;

    const espnDate = comp.date;
    if (!espnDate) return null;
    const utcDay = espnDate.slice(0, 10);

    const competitors = comp.competitors ?? [];
    const awayTri = this.normalizeTricode(
      competitors.find((c: any) => c.homeAway === 'away')?.team?.abbreviation,
    );
    const homeTri = this.normalizeTricode(
      competitors.find((c: any) => c.homeAway === 'home')?.team?.abbreviation,
    );
    if (!awayTri || !homeTri) return null;

    const schedule = await this.getLeagueSchedule();
    const gameDates: any[] = schedule?.gameDates ?? [];

    const target = new Date(`${utcDay}T00:00:00Z`).getTime();
    let found: string | null = null;
    for (const gd of gameDates) {
      const games = gd?.games ?? [];
      for (const g of games) {
        const gTime = new Date(g.gameDateTimeEst ?? g.gameDateTimeUTC ?? 0).getTime();
        if (Math.abs(gTime - target) > 48 * 3600 * 1000) continue;
        const a = (g.awayTeam?.teamTricode ?? '').toUpperCase();
        const h = (g.homeTeam?.teamTricode ?? '').toUpperCase();
        if (a === awayTri && h === homeTri) {
          found = g.gameId;
          break;
        }
      }
      if (found) break;
    }

    if (found) {
      await this.redis.set(cacheKey, found, 30 * 86400);
      this.logger.debug(`ESPN ${eventId} ↔ NBA ${found} (${awayTri}@${homeTri})`);
    } else {
      this.logger.warn(
        `ESPN ${eventId} 找不到對應的 NBA gameId（${awayTri}@${homeTri}, date=${utcDay}）`,
      );
    }
    return found;
  }

  /**
   * NBA 動畫直播快照（合成 cdn box + cdn pbp 的精簡 payload）
   *
   * 包含：
   * - status：gameStatus（1=排定 / 2=進行 / 3=結束）+ statusText + period + clock
   * - teams：雙隊 tricode/name/score/各節分數/暫停剩餘/bonus 狀態
   * - onCourt：兩隊目前在場上球員（oncourt=1），含即時統計
   * - recentActions：最近 10 個事件（描述、加分、時間戳）
   * - recentShots：最近 30 次投籃落點（x/y 標準化座標 + 命中/未中）
   * - momentum：每 30 個 action 抽樣一個比分差，用於折線圖
   *
   * 3s Redis 快取，與內層 box/pbp 的 3s TTL 對齊，讓進行中比賽約 3 秒更新一次。
   * 快取 key 以場次為單位（多人同看同一場共用一份），上游每場每 3 秒只打一次。
   * 已結束比賽由前端改用 60s 輪詢，後端不會頻繁回源。
   */
  async getNbaLiveSnapshot(eventId: string) {
    const nbaGameId = await this.resolveEspnEventToNbaGameId(eventId);
    if (!nbaGameId) return null;

    const cacheKey = `nba:live:${eventId}`;
    return this.cached(cacheKey, 3, async () => {
      const [boxRaw, pbpRaw] = await Promise.all([
        this.getCdnBoxScore(nbaGameId),
        this.getCdnPlayByPlay(nbaGameId),
      ]);
      if (!boxRaw) return null;
      return this.buildNbaLiveSnapshot(boxRaw, pbpRaw, nbaGameId);
    });
  }

  /** 將 cdn box + pbp 壓成前端動畫直播的精簡 payload */
  private buildNbaLiveSnapshot(box: any, pbp: any, nbaGameId: string) {
    const shrinkTeam = (t: any) => {
      if (!t) return null;
      return {
        teamId: t.teamId,
        teamName: t.teamName,
        teamCity: t.teamCity,
        teamTricode: t.teamTricode,
        score: t.score ?? 0,
        timeoutsRemaining: t.timeoutsRemaining ?? 0,
        inBonus: t.inBonus === '1',
        periods: (t.periods ?? []).map((p: any) => ({ period: p.period, score: p.score })),
      };
    };

    const shrinkPlayer = (p: any) => ({
      personId: p.personId,
      name: p.name,
      nameI: p.nameI ?? p.name,
      firstName: p.firstName,
      familyName: p.familyName,
      jerseyNum: p.jerseyNum,
      position: p.position,
      starter: p.starter === '1',
      oncourt: p.oncourt === '1',
      status: p.status,
      stats: {
        points: p.statistics?.points ?? 0,
        rebounds: p.statistics?.reboundsTotal ?? 0,
        assists: p.statistics?.assists ?? 0,
        steals: p.statistics?.steals ?? 0,
        blocks: p.statistics?.blocks ?? 0,
        turnovers: p.statistics?.turnovers ?? 0,
        plusMinus: p.statistics?.plusMinusPoints ?? 0,
        fgm: p.statistics?.fieldGoalsMade ?? 0,
        fga: p.statistics?.fieldGoalsAttempted ?? 0,
        tpm: p.statistics?.threePointersMade ?? 0,
        tpa: p.statistics?.threePointersAttempted ?? 0,
        ftm: p.statistics?.freeThrowsMade ?? 0,
        fta: p.statistics?.freeThrowsAttempted ?? 0,
        minutes: p.statistics?.minutes ?? '',
        fouls: p.statistics?.foulsPersonal ?? 0,
      },
    });

    const awayTeam = shrinkTeam(box.awayTeam);
    const homeTeam = shrinkTeam(box.homeTeam);

    const awayPlayers = (box.awayTeam?.players ?? []).map(shrinkPlayer);
    const homePlayers = (box.homeTeam?.players ?? []).map(shrinkPlayer);

    const actions: any[] = pbp?.actions ?? [];

    // 最近 10 個有意義事件（過濾掉 game/period 兩種 marker，除非是結束標記）
    const meaningful = actions.filter(
      (a) =>
        !['jumpball'].includes(a.actionType) ||
        ['game', 'period'].includes(a.actionType),
    );
    const recentActions = actions.slice(-15).map((a) => ({
      actionNumber: a.actionNumber,
      period: a.period,
      clock: a.clock,
      teamId: a.teamId,
      teamTricode: a.teamTricode,
      actionType: a.actionType,
      subType: a.subType,
      descriptor: a.descriptor,
      qualifiers: a.qualifiers,
      personId: a.personId,
      playerName: a.playerName,
      playerNameI: a.playerNameI,
      description: a.description,
      scoreAway: a.scoreAway,
      scoreHome: a.scoreHome,
      shotResult: a.shotResult,
      pointsTotal: a.pointsTotal,
      isFieldGoal: a.isFieldGoal,
      shotDistance: a.shotDistance,
      area: a.area,
    }));

    // 最近 30 次投籃（落點動畫用）
    const shotActions = actions.filter(
      (a) =>
        (a.actionType === '2pt' || a.actionType === '3pt') &&
        a.x !== null &&
        a.x !== undefined &&
        a.y !== null &&
        a.y !== undefined,
    );
    const recentShots = shotActions.slice(-30).map((a) => ({
      actionNumber: a.actionNumber,
      period: a.period,
      clock: a.clock,
      teamId: a.teamId,
      teamTricode: a.teamTricode,
      personId: a.personId,
      playerName: a.playerName,
      playerNameI: a.playerNameI,
      x: a.x, // 0~100，0 = 籃框正下方左側、100 = 右側
      y: a.y, // 0~100，0 = 籃框、越大越遠離籃框
      shotDistance: a.shotDistance,
      shotResult: a.shotResult, // "Made" / "Missed"
      pointsTotal: a.pointsTotal,
      isThreePoint: a.actionType === '3pt',
      area: a.area,
      subType: a.subType,
    }));

    // 領先勢頭（每場約 600 actions，抽樣到 ~60 個點即可畫順）
    const sampleStep = Math.max(1, Math.floor(actions.length / 60));
    const momentum: { period: number; diff: number; clock: string }[] = [];
    for (let i = 0; i < actions.length; i += sampleStep) {
      const a = actions[i];
      const home = parseInt(a.scoreHome ?? '0', 10);
      const away = parseInt(a.scoreAway ?? '0', 10);
      momentum.push({
        period: a.period,
        clock: a.clock,
        diff: home - away,
      });
    }
    // 確保最後一點是最終比分
    if (actions.length > 0) {
      const last = actions[actions.length - 1];
      const home = parseInt(last.scoreHome ?? '0', 10);
      const away = parseInt(last.scoreAway ?? '0', 10);
      momentum.push({ period: last.period, clock: last.clock, diff: home - away });
    }

    return {
      eventId: nbaGameId, // 內部欄位
      nbaGameId,
      status: {
        gameStatus: box.gameStatus,
        statusText: box.gameStatusText,
        period: box.period,
        clock: box.gameClock,
        gameTimeUTC: box.gameTimeUTC,
        attendance: box.attendance,
        sellout: box.sellout === '1',
      },
      teams: { away: awayTeam, home: homeTeam },
      players: { away: awayPlayers, home: homePlayers },
      recentActions,
      recentShots,
      momentum,
      totalActions: actions.length,
    };
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
