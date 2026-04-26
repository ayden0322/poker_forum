import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis.service';

/**
 * CPBL 官方網站 API 包裝服務
 *
 * 資料來源：https://www.cpbl.com.tw
 * 特色：免費、資料完整（含打擊/投球逐場統計、逐球紀錄）
 * 注意：需要 CSRF token + cookie，token 有效期約 30 分鐘
 *
 * 主要端點：
 *   POST /box/getlive — 取得單場 Box Score（打擊、投球、逐局比分、逐球）
 *   POST /schedule/getgamedatas — 取得賽程表
 */
@Injectable()
export class CpblStatsService {
  private readonly logger = new Logger(CpblStatsService.name);
  private readonly baseUrl = 'https://www.cpbl.com.tw';

  // ============ 診斷工具（B0）============

  /**
   * 診斷 CPBL 官網連線狀態
   * 回傳每個步驟的詳細資訊，幫助找出正式環境連不到的根因
   */
  async diagnose(): Promise<DiagnoseResult> {
    const result: DiagnoseResult = {
      timestamp: new Date().toISOString(),
      steps: [],
    };

    // 步驟 1：能否拿到 /box 頁面 HTML
    const step1 = await this.timed(async () => {
      const res = await fetch(`${this.baseUrl}/box`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-TW,zh;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
      });
      const html = await res.text();
      const setCookies = res.headers.getSetCookie?.() ?? [];
      return {
        status: res.status,
        ok: res.ok,
        contentType: res.headers.get('content-type'),
        htmlLength: html.length,
        htmlPreview: html.substring(0, 200),
        cookieCount: setCookies.length,
        hasTokenInput: /name="__RequestVerificationToken"/.test(html),
        hasTokenInJs: /RequestVerificationToken['"]?\s*:/.test(html),
      };
    });
    result.steps.push({ name: 'fetch /box', ...step1 });

    // 步驟 2：能否拿到 /schedule 頁面 HTML
    const step2 = await this.timed(async () => {
      const res = await fetch(`${this.baseUrl}/schedule`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(15000),
      });
      const html = await res.text();
      return {
        status: res.status,
        ok: res.ok,
        htmlLength: html.length,
        htmlPreview: html.substring(0, 200),
        hasTokenInJs: /RequestVerificationToken['"]?\s*:/.test(html),
      };
    });
    result.steps.push({ name: 'fetch /schedule', ...step2 });

    // 步驟 3：嘗試實際呼叫 schedule API
    const step3 = await this.timed(async () => {
      const data = await this.callScheduleApi<any>({
        calendar: '2026/04/01',
        kindCode: 'A',
        location: '',
      });
      return {
        success: data?.Success,
        gameDataLength: data?.GameDatas?.length ?? 0,
        rawSample: typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : String(data).substring(0, 200),
      };
    });
    result.steps.push({ name: 'callScheduleApi', ...step3 });

    return result;
  }

  /** 計時包裝器，捕捉任何 throw */
  private async timed(
    fn: () => Promise<any>,
  ): Promise<{ ms: number; data?: any; error?: string }> {
    const start = Date.now();
    try {
      const data = await fn();
      return { ms: Date.now() - start, data };
    } catch (err) {
      return { ms: Date.now() - start, error: String(err) };
    }
  }

  /** Box 頁面 CSRF token 快取（記憶體 + Redis 雙層） */
  private csrfToken: string | null = null;
  private csrfCookies: string | null = null;
  private csrfExpiresAt = 0; // timestamp ms

  /** Schedule 頁面 token 快取（header 方式） */
  private scheduleToken: string | null = null;
  private scheduleCookies: string | null = null;
  private scheduleTokenExpiresAt = 0;

  /** Token 有效期（25 分鐘，留 5 分鐘安全餘量） */
  private readonly TOKEN_TTL_MS = 25 * 60 * 1000;
  private readonly REDIS_TOKEN_KEY = 'cpbl:csrf';
  private readonly REDIS_SCHEDULE_TOKEN_KEY = 'cpbl:csrf:schedule';
  private readonly REDIS_TOKEN_TTL = 1500; // 25 分鐘（秒）

  constructor(private redis: RedisService) {}

  // ============ CSRF Token 管理 ============

  /**
   * 取得有效的 CSRF token + cookies
   * 優先從記憶體 → Redis → 重新抓取
   */
  private async getValidToken(): Promise<{ token: string; cookies: string }> {
    // 1) 記憶體快取仍有效
    if (this.csrfToken && this.csrfCookies && Date.now() < this.csrfExpiresAt) {
      return { token: this.csrfToken, cookies: this.csrfCookies };
    }

    // 2) 嘗試從 Redis 恢復
    const cached = await this.redis.get<{ token: string; cookies: string }>(this.REDIS_TOKEN_KEY);
    if (cached) {
      this.csrfToken = cached.token;
      this.csrfCookies = cached.cookies;
      this.csrfExpiresAt = Date.now() + 5 * 60 * 1000; // 至少 5 分鐘
      return cached;
    }

    // 3) 重新抓取
    return this.refreshToken();
  }

  /**
   * 從 CPBL 官網取得新的 CSRF token
   * 流程：GET /box → 從 HTML 提取 __RequestVerificationToken → 儲存 cookies
   */
  private async refreshToken(): Promise<{ token: string; cookies: string }> {
    this.logger.log('[CPBL] 重新取得 CSRF token...');

    try {
      const res = await fetch(`${this.baseUrl}/box`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-TW,zh;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        throw new Error(`CPBL 頁面回傳 ${res.status}`);
      }

      // 提取 cookies
      const setCookies = res.headers.getSetCookie?.() ?? [];
      const cookies = setCookies
        .map((c) => c.split(';')[0])
        .filter(Boolean)
        .join('; ');

      // 提取 CSRF token
      const html = await res.text();
      const tokenMatch = html.match(
        /name="__RequestVerificationToken"[^>]*value="([^"]+)"/,
      );

      if (!tokenMatch) {
        throw new Error('找不到 __RequestVerificationToken');
      }

      const token = tokenMatch[1];

      // 儲存到記憶體
      this.csrfToken = token;
      this.csrfCookies = cookies;
      this.csrfExpiresAt = Date.now() + this.TOKEN_TTL_MS;

      // 儲存到 Redis（多實例共用）
      await this.redis.set(this.REDIS_TOKEN_KEY, { token, cookies }, this.REDIS_TOKEN_TTL);

      this.logger.log('[CPBL] CSRF token 取得成功');
      return { token, cookies };
    } catch (err) {
      this.logger.error(`[CPBL] CSRF token 取得失敗：${err}`);
      throw err;
    }
  }

  // ============ Schedule Token 管理（header 方式）============

  /**
   * 取得 Schedule 頁面的有效 token
   * Schedule API 使用 header 方式傳 token（RequestVerificationToken header）
   */
  private async getValidScheduleToken(): Promise<{ token: string; cookies: string }> {
    if (this.scheduleToken && this.scheduleCookies && Date.now() < this.scheduleTokenExpiresAt) {
      return { token: this.scheduleToken, cookies: this.scheduleCookies };
    }

    const cached = await this.redis.get<{ token: string; cookies: string }>(this.REDIS_SCHEDULE_TOKEN_KEY);
    if (cached) {
      this.scheduleToken = cached.token;
      this.scheduleCookies = cached.cookies;
      this.scheduleTokenExpiresAt = Date.now() + 5 * 60 * 1000;
      return cached;
    }

    return this.refreshScheduleToken();
  }

  private async refreshScheduleToken(): Promise<{ token: string; cookies: string }> {
    this.logger.log('[CPBL] 重新取得 Schedule CSRF token...');

    try {
      const res = await fetch(`${this.baseUrl}/schedule`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) throw new Error(`CPBL schedule 頁面回傳 ${res.status}`);

      const setCookies = res.headers.getSetCookie?.() ?? [];
      const cookies = setCookies.map((c) => c.split(';')[0]).filter(Boolean).join('; ');

      const html = await res.text();
      // Schedule 頁面在 JS 中有 RequestVerificationToken header value
      const headerTokenMatch = html.match(/RequestVerificationToken['"]?\s*:\s*['"]([^'"]+)/);

      if (!headerTokenMatch) throw new Error('找不到 Schedule RequestVerificationToken');

      const token = headerTokenMatch[1];

      this.scheduleToken = token;
      this.scheduleCookies = cookies;
      this.scheduleTokenExpiresAt = Date.now() + this.TOKEN_TTL_MS;

      await this.redis.set(this.REDIS_SCHEDULE_TOKEN_KEY, { token, cookies }, this.REDIS_TOKEN_TTL);

      this.logger.log('[CPBL] Schedule CSRF token 取得成功');
      return { token, cookies };
    } catch (err) {
      this.logger.error(`[CPBL] Schedule CSRF token 取得失敗：${err}`);
      throw err;
    }
  }

  /** 呼叫 Schedule API（使用 header token） */
  private async callScheduleApi<T>(
    body: Record<string, string | number>,
  ): Promise<T | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { token, cookies } = await this.getValidScheduleToken();

        const formBody = new URLSearchParams();
        for (const [k, v] of Object.entries(body)) {
          formBody.set(k, String(v));
        }

        const res = await fetch(`${this.baseUrl}/schedule/getgamedatas`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookies,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Referer': `${this.baseUrl}/schedule`,
            'X-Requested-With': 'XMLHttpRequest',
            'RequestVerificationToken': token,
          },
          body: formBody.toString(),
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          if (attempt === 0) {
            this.logger.warn(`[CPBL] Schedule API ${res.status}，刷新 token 重試...`);
            this.scheduleToken = null;
            await this.redis.del(this.REDIS_SCHEDULE_TOKEN_KEY);
            continue;
          }
          this.logger.error(`[CPBL] Schedule API 回傳 ${res.status}`);
          return null;
        }

        return (await res.json()) as T;
      } catch (err) {
        if (attempt === 0) {
          this.scheduleToken = null;
          await this.redis.del(this.REDIS_SCHEDULE_TOKEN_KEY);
          continue;
        }
        this.logger.error(`[CPBL] Schedule API 最終失敗：${err}`);
        return null;
      }
    }
    return null;
  }

  /**
   * 呼叫 CPBL POST API（帶 CSRF token，用於 /box 系列端點）
   * 失敗時自動重試一次（token 過期 → 刷新後重試）
   */
  private async callCpblApi<T>(
    endpoint: string,
    body: Record<string, string | number>,
  ): Promise<T | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { token, cookies } = await this.getValidToken();

        const formBody = new URLSearchParams();
        formBody.set('__RequestVerificationToken', token);
        for (const [k, v] of Object.entries(body)) {
          formBody.set(k, String(v));
        }

        const res = await fetch(`${this.baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookies,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Referer': `${this.baseUrl}/box`,
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: formBody.toString(),
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          // Token 過期或被拒 → 第一次失敗時刷新 token 重試
          if (attempt === 0 && (res.status === 500 || res.status === 403)) {
            this.logger.warn(`[CPBL] API ${res.status}，嘗試刷新 token 重試...`);
            this.csrfToken = null; // 強制刷新
            await this.redis.del(this.REDIS_TOKEN_KEY);
            continue;
          }
          this.logger.error(`[CPBL] API ${endpoint} 回傳 ${res.status}`);
          return null;
        }

        return (await res.json()) as T;
      } catch (err) {
        if (attempt === 0) {
          this.logger.warn(`[CPBL] 呼叫失敗，刷新 token 重試：${err}`);
          this.csrfToken = null;
          await this.redis.del(this.REDIS_TOKEN_KEY);
          continue;
        }
        this.logger.error(`[CPBL] API ${endpoint} 最終失敗：${err}`);
        return null;
      }
    }
    return null;
  }

  /** 帶 Redis 快取的呼叫 */
  private async cached<T>(
    cacheKey: string,
    ttl: number,
    fetcher: () => Promise<T | null>,
  ): Promise<T | null> {
    const hit = await this.redis.get<T>(cacheKey);
    if (hit) return hit;
    const data = await fetcher();
    if (data) await this.redis.set(cacheKey, data, ttl);
    return data;
  }

  // ============ Box Score（單場戰報） ============

  /**
   * 取得單場 Box Score
   *
   * @param gameSno 比賽序號（CPBL 內部 ID）
   * @param year 年份（西元，如 2026）
   * @param kindCode 比賽類型：A=例行賽, B=季後賽, C=總冠軍賽
   */
  async getBoxScore(gameSno: number, year: number = new Date().getFullYear(), kindCode = 'A') {
    const cacheKey = `cpbl:boxscore:${year}:${kindCode}:${gameSno}`;
    // 進行中比賽 60 秒快取，已結束 1 小時
    return this.cached(cacheKey, 60, async () => {
      const raw = await this.callCpblApi<any>('/box/getlive', {
        GameSno: gameSno,
        Year: year,
        KindCode: kindCode,
      });

      if (!raw?.Success) {
        this.logger.warn(`[CPBL] Box Score 失敗：GameSno=${gameSno}`);
        return null;
      }

      // 解析 JSON 字串欄位
      const gameDetail = this.safeParseJson(raw.GameDetailJson);
      const scoreboard = this.safeParseJson(raw.ScoreboardJson);
      const batting = this.safeParseJson(raw.BattingJson);
      const pitching = this.safeParseJson(raw.PitchingJson);
      const liveLog = this.safeParseJson(raw.LiveLogJson);

      // GameDetail 是陣列格式，取第一項（當日可能有多場）
      const detail = Array.isArray(gameDetail) ? gameDetail[0] : gameDetail;

      // 判斷比賽是否已結束（GameStatus: 3=比賽結束）
      const isFinished = detail?.GameStatus === 3;

      const result = {
        gameSno,
        year,
        kindCode,
        gameDetail: this.normalizeGameDetail(detail),
        scoreboard: this.normalizeScoreboard(scoreboard),
        batting: this.normalizeBatting(batting),
        pitching: this.normalizePitching(pitching),
        liveLog: this.normalizeLiveLog(liveLog),
      };

      // 已結束比賽用更長的快取
      if (isFinished) {
        await this.redis.set(cacheKey, result, 3600);
      }

      return result;
    });
  }

  // ============ 賽程表 ============

  /**
   * 取得 CPBL 賽程表（指定月份）
   *
   * @param year 年份（西元）
   * @param month 月份（1-12）
   * @param kindCode 比賽類型
   */
  async getSchedule(year: number, month: number, kindCode = 'A') {
    const cacheKey = `cpbl:schedule:${year}:${month}:${kindCode}`;
    return this.cached(cacheKey, 300, async () => {
      // Schedule API 使用不同的 token 方式（header）和參數格式
      // calendar 參數格式：YYYY/MM/DD（取該月第一天）
      const calendar = `${year}/${String(month).padStart(2, '0')}/01`;

      const raw = await this.callScheduleApi<any>({
        calendar,
        kindCode,
        location: '',
      });

      if (!raw?.Success) return null;

      // GameDatas 是 JSON 字串，需要額外解析
      const gamesStr = raw.GameDatas;
      const games = typeof gamesStr === 'string' ? this.safeParseJson(gamesStr) : gamesStr;

      if (!Array.isArray(games)) return null;

      return games.map((g: any) => this.normalizeScheduleGame(g));
    });
  }

  /**
   * 取得今日 CPBL 賽程（含 GameSno）
   * 用於前端比賽詳情頁的「CPBL 官方資料增強」
   */
  async getTodayGames(year?: number, kindCode = 'A') {
    const now = new Date();
    const twNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    const y = year ?? twNow.getFullYear();
    const m = twNow.getMonth() + 1;

    const schedule = await this.getSchedule(y, m, kindCode);
    if (!schedule) return [];

    const todayStr = `${y}-${String(m).padStart(2, '0')}-${String(twNow.getDate()).padStart(2, '0')}`;

    return schedule.filter((g: any) => g.date === todayStr);
  }

  // ============ 資料正規化 ============

  private normalizeGameDetail(raw: any): CpblGameDetail | null {
    if (!raw) return null;

    // 解析比賽時間 "032300" → "3:23:00"
    let duration: string | null = null;
    if (raw.GameDuringTime) {
      const d = raw.GameDuringTime;
      const h = parseInt(d.substring(0, 2), 10);
      const m = d.substring(2, 4);
      const s = d.substring(4, 6);
      duration = `${h}:${m}:${s}`;
    }

    return {
      visitingTeam: raw.VisitingTeamName ?? '',
      homeTeam: raw.HomeTeamName ?? '',
      visitingTeamCode: raw.VisitingTeamCode ?? null,
      homeTeamCode: raw.HomeTeamCode ?? null,
      visitingTeamLogo: raw.VisitingClubSmallImgPath
        ? `https://www.cpbl.com.tw${raw.VisitingClubSmallImgPath}`
        : null,
      homeTeamLogo: raw.HomeClubSmallImgPath
        ? `https://www.cpbl.com.tw${raw.HomeClubSmallImgPath}`
        : null,
      visitingScore: raw.VisitingTotalScore ?? 0,
      homeScore: raw.HomeTotalScore ?? 0,
      gameStatus: raw.GameStatus ?? null,
      gameStatusText: raw.GameStatusChi ?? null,
      winPitcher: raw.WinningPitcherName ?? null,
      losePitcher: raw.LosePitcherName ?? null,
      savePitcher: raw.CloserPitcherName ?? null,
      visitingStarter: raw.VisitingFirstMover ?? null,
      homeStarter: raw.HomeFirstMover ?? null,
      gameDuration: duration,
      weather: raw.WeatherDesc ?? null,
      audience: raw.AudienceCntBackend ?? null,
      stadium: raw.FieldAbbe ?? null,
      // 裁判資訊
      headUmpire: raw.HeadUmpire ?? null,
      // 戰績（W-L-T）
      visitingRecord: raw.VisitingGameResultWCnt != null
        ? `${raw.VisitingGameResultWCnt}-${raw.VisitingGameResultLCnt}-${raw.VisitingGameResultTCnt}`
        : null,
      homeRecord: raw.HomeGameResultWCnt != null
        ? `${raw.HomeGameResultWCnt}-${raw.HomeGameResultLCnt}-${raw.HomeGameResultTCnt}`
        : null,
    };
  }

  private normalizeScoreboard(raw: any[]): CpblScoreboardEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((entry) => ({
      teamAbbr: entry.TeamAbbr ?? '',
      inning: entry.InningSeq ?? entry.Inning ?? 0,
      runs: entry.ScoreCnt ?? entry.Score ?? 0,
      hits: entry.HittingCnt ?? entry.Hits ?? 0,
      errors: entry.ErrorCnt ?? entry.Errors ?? 0,
    }));
  }

  private normalizeBatting(raw: any[]): CpblBattingEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((b) => ({
      name: b.HitterName ?? '',
      uniformNo: b.HitterUniformNo ?? '',
      side: b.VisitingHomeType ?? '', // 1=客隊, 2=主隊
      roleType: b.RoleType ?? '', // 先發 / 代打
      order: b.Seq ? parseInt(b.Seq, 10) : 0,
      battingOrder: b.HitterLineup ?? b.BattingOrder ?? 0,
      plateAppearances: b.PlateAppearances ?? 0,
      atBats: b.HitCnt ?? 0,        // CPBL 命名：HitCnt = 打數(AB)
      hits: b.HittingCnt ?? 0,      // CPBL 命名：HittingCnt = 安打數(H)
      singles: b.OneBaseHitCnt ?? 0,
      doubles: b.TwoBaseHitCnt ?? 0,
      triples: b.ThreeBaseHitCnt ?? 0,
      homeRuns: b.HomeRunCnt ?? 0,
      rbi: b.RunBattedINCnt ?? 0,
      runs: b.ScoreCnt ?? 0,
      strikeouts: b.StrikeOutCnt ?? 0,
      walks: b.BasesONBallsCnt ?? 0,
      hitByPitch: b.HitBYPitchCnt ?? 0,
      stolenBases: b.StealBaseOKCnt ?? 0,
      caughtStealing: b.StealBaseFailCnt ?? 0,
      sacrificeHits: b.SacrificeHitCnt ?? 0,
      sacrificeFlies: b.SacrificeFlyCnt ?? 0,
      doublePlays: b.DoublePlayBatCnt ?? 0,
      totalBases: b.TotalBases ?? 0,
      errors: b.ErrorCnt ?? 0,
      isMvp: b.IsMvp === '1',
    }));
  }

  private normalizePitching(raw: any[]): CpblPitchingEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((p) => ({
      name: p.PitcherName ?? '',
      uniformNo: p.PitcherUniformNo ?? '',
      team: p.TeamAbbr ?? '',
      inningsPitched: p.InningPitchedCnt ?? '',
      hits: p.HittingCnt ?? 0,
      runs: p.RunCnt ?? 0,
      earnedRuns: p.EarnedRunCnt ?? 0,
      strikeouts: p.StrikeOutCnt ?? 0,
      walks: p.BasesONBallsCnt ?? 0,
      homeRuns: p.HomeRunCnt ?? 0,
      pitchCount: p.PitchCnt ?? 0,
      strikes: p.StrikeCnt ?? 0,
      balls: p.BallCnt ?? 0,
      era: p.EarnedRunAverage ?? null,
      result: p.GameResult ?? null, // W / L / S / H
    }));
  }

  private normalizeLiveLog(raw: any[]): CpblLiveLogEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((l) => ({
      inning: l.InningSeq ?? 0,
      halfInning: l.VisitingHomeType ?? '', // 1=上半（客隊攻擊）, 2=下半（主隊攻擊）
      content: l.Content ?? '',
      battingOrder: l.BattingOrder ?? 0,
      hitterName: l.HitterName ?? '',
      hitterNo: l.HitterUniformNo ?? '',
      pitcherName: l.PitcherName ?? '',
      pitcherNo: l.PitcherUniformNo ?? '',
      isStrike: l.IsStrike === '1',
      isBall: l.IsBall === '1',
      strikeCnt: l.StrikeCnt ?? 0,
      ballCnt: l.BallCnt ?? 0,
      outCnt: l.OutCnt ?? 0,
      pitchCnt: l.PitchCnt ?? 0,
      visitingScore: l.VisitingScore ?? 0,
      homeScore: l.HomeScore ?? 0,
      actionName: l.ActionName ?? '',
      bases: {
        first: l.FirstBase ?? '',
        second: l.SecondBase ?? '',
        third: l.ThirdBase ?? '',
      },
    }));
  }

  private normalizeScheduleGame(raw: any): any {
    // GameDate 格式：2026-03-28T00:00:00 → 取 YYYY-MM-DD
    let date = raw.GameDate ?? null;
    if (date && date.includes('T')) {
      date = date.split('T')[0];
    }

    // 比賽時間從 GameDateTimeS 提取
    let time: string | null = null;
    if (raw.GameDateTimeS) {
      const dt = new Date(raw.GameDateTimeS);
      time = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    }

    return {
      gameSno: raw.GameSno ?? null,
      date,
      time,
      homeTeam: raw.HomeTeamName ?? '',
      awayTeam: raw.VisitingTeamName ?? '',
      homeTeamCode: raw.HomeTeamCode ?? null,
      awayTeamCode: raw.VisitingTeamCode ?? null,
      homeScore: raw.HomeScore ?? null,
      awayScore: raw.VisitingScore ?? null,
      stadium: raw.FieldAbbe ?? '',
      kindCode: raw.KindCode ?? 'A',
      // 狀態：PresentStatus 1=已結束, 其他待確認
      isFinished: raw.PresentStatus === 1,
      // 先發投手帳號（用於後續查找）
      homeStarterAcnt: raw.HomePitcherAcnt ?? null,
      awayStarterAcnt: raw.VisitingPitcherAcnt ?? null,
    };
  }

  private safeParseJson(jsonStr: string | any): any {
    if (!jsonStr) return null;
    if (typeof jsonStr !== 'string') return jsonStr;
    try {
      return JSON.parse(jsonStr);
    } catch {
      this.logger.warn(`[CPBL] JSON 解析失敗：${jsonStr.substring(0, 100)}`);
      return null;
    }
  }
}

// ============ 型別定義 ============

export interface CpblGameDetail {
  visitingTeam: string;
  homeTeam: string;
  visitingTeamCode: string | null;
  homeTeamCode: string | null;
  visitingTeamLogo: string | null;
  homeTeamLogo: string | null;
  visitingScore: number;
  homeScore: number;
  gameStatus: number | null;
  gameStatusText: string | null;
  winPitcher: string | null;
  losePitcher: string | null;
  savePitcher: string | null;
  visitingStarter: string | null;
  homeStarter: string | null;
  gameDuration: string | null;
  weather: string | null;
  audience: number | null;
  stadium: string | null;
  headUmpire: string | null;
  visitingRecord: string | null;
  homeRecord: string | null;
}

export interface CpblScoreboardEntry {
  teamAbbr: string;
  inning: number;
  runs: number;
  hits: number;
  errors: number;
}

export interface CpblBattingEntry {
  name: string;
  uniformNo: string;
  side: string;
  roleType: string;
  order: number;
  battingOrder: number;
  plateAppearances: number;
  atBats: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  rbi: number;
  runs: number;
  strikeouts: number;
  walks: number;
  hitByPitch: number;
  stolenBases: number;
  caughtStealing: number;
  sacrificeHits: number;
  sacrificeFlies: number;
  doublePlays: number;
  totalBases: number;
  errors: number;
  isMvp: boolean;
}

export interface CpblPitchingEntry {
  name: string;
  uniformNo: string;
  team: string;
  inningsPitched: string;
  hits: number;
  runs: number;
  earnedRuns: number;
  strikeouts: number;
  walks: number;
  homeRuns: number;
  pitchCount: number;
  strikes: number;
  balls: number;
  era: string | null;
  result: string | null;
}

export interface CpblLiveLogEntry {
  inning: number;
  halfInning: string;
  content: string;
  battingOrder: number;
  hitterName: string;
  hitterNo: string;
  pitcherName: string;
  pitcherNo: string;
  isStrike: boolean;
  isBall: boolean;
  strikeCnt: number;
  ballCnt: number;
  outCnt: number;
  pitchCnt: number;
  visitingScore: number;
  homeScore: number;
  actionName: string;
  bases: {
    first: string;
    second: string;
    third: string;
  };
}

export interface DiagnoseResult {
  timestamp: string;
  steps: Array<{
    name: string;
    ms: number;
    data?: any;
    error?: string;
  }>;
}
