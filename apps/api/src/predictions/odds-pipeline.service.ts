// P幣競猜 — 賠率管線：賽程同步 + 盤口抓取 → PredictionMatch / OddsQuote（DB 權威）+ Redis 顯示快取
// 設計依據：《P幣競猜系統-詳細設計規格.md》§2
// 原則：
//   - OddsQuote 的 odds/line/selection 不可變；賠率沒變時只更新 fetchedAt（re-confirm，避免表爆量）
//   - 賠率變了 → 舊 quote 翻 active=false、插入新 quote（完整留變動軌跡）
//   - Redis 只是顯示快取，收單永遠不看它
//   - 額度守門：每 host 每日 odds 呼叫計數，超軟上限自動只跑遠期頻率 + 告警

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@betting-forum/database';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import {
  PredictionBoardConfig,
  FIXTURES_LOOKAHEAD,
  ODDS_DAILY_SOFT_CAP,
  ODDS_DISPLAY_TTL_SEC,
  QUOTA_KEY_PREFIX,
  REVALIDATE_DAILY_BUDGET,
  REVALIDATE_KEY_PREFIX,
  oddsDisplayKey,
} from './prediction.config';
import {
  ParsedMatchOdds,
  parseBaseballOddsItem,
  parseFootballFixture,
  parseFootballOddsItem,
} from './odds-parsers';
import { createHash } from 'crypto';

interface ApiEnvelope<T> {
  response: T;
  paging?: { current: number; total: number };
  errors?: Record<string, string> | unknown[];
}

@Injectable()
export class OddsPipelineService {
  private readonly logger = new Logger(OddsPipelineService.name);
  private readonly apiKey: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private redis: RedisService,
  ) {
    this.apiKey = this.config.get<string>('API_SPORTS_KEY', '');
  }

  /** 跑一輪：賽程同步 + 盤口抓取。回傳本輪用掉的 API 呼叫數。 */
  async runRound(board: PredictionBoardConfig): Promise<number> {
    let calls = 0;
    try {
      if (board.sportType === 'football') {
        calls += await this.syncFootballFixtures(board);
        calls += await this.fetchFootballOdds(board);
      } else {
        // baseball：/odds 回應自帶 game（teams/status/date），一次呼叫同時完成賽程同步+盤口
        calls += await this.fetchBaseballOdds(board);
      }
      await this.bumpQuota(board.apiHost, calls);
    } catch (err) {
      this.logger.error(`賠率管線失敗（${board.boardSlug}）：${err}`);
    }
    return calls;
  }

  /** demand-driven 重驗的 in-flight map（single-flight：同場併發下注共用一次重抓） */
  private readonly revalidateInFlight = new Map<string, Promise<boolean>>();

  /**
   * 單場 demand-driven 重驗（規格 §2.3）：下注時 quote 超齡 → 即時重抓該場盤口寫入 OddsQuote。
   * single-flight：同 matchId 併發呼叫共用同一次 API 重抓。
   * 回傳 true=重抓成功且已寫入；false=API 失敗/預算爆/無盤（呼叫端一律 fail-closed 拒單）。
   */
  async revalidateMatch(
    board: PredictionBoardConfig,
    match: { id: string; apiFixtureId: number },
  ): Promise<boolean> {
    const existing = this.revalidateInFlight.get(match.id);
    if (existing) return existing;

    const task = (async (): Promise<boolean> => {
      // 重驗預算（每 host 每日；與顯示 cron 的額度分開計，爆了 fail-closed）
      const budgetKey = `${REVALIDATE_KEY_PREFIX}:${board.apiHost}:${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
      const used = (await this.redis.get<number>(budgetKey)) ?? 0;
      if (used >= REVALIDATE_DAILY_BUDGET) {
        this.logger.warn(`重驗預算爆量：${board.apiHost} 今日 ${used}/${REVALIDATE_DAILY_BUDGET}，拒單`);
        return false;
      }
      await this.redis.set(budgetKey, used + 1, 26 * 60 * 60);
      await this.bumpQuota(board.apiHost, 1);

      const idParam = board.sportType === 'football' ? 'fixture' : 'game';
      const data = await this.callApiRaw<any[]>(board.apiHost, '/odds', {
        [idParam]: match.apiFixtureId,
        bookmaker: board.bookmakerId,
      });
      const item = data?.response?.[0];
      if (!item) return false; // API 掛 / 無盤（含已轉 live 後 pre-match 盤收掉）→ fail-closed

      const parsed =
        board.sportType === 'football'
          ? parseFootballOddsItem(item, board.bookmakerId, board.markets)
          : parseBaseballOddsItem(item, board.bookmakerId, board.markets);
      if (parsed.quotes.length === 0) return false;

      const written = await this.storeMatchOdds(board, parsed, item);
      return written > 0;
    })().finally(() => this.revalidateInFlight.delete(match.id));

    this.revalidateInFlight.set(match.id, task);
    return task;
  }

  // ===== 額度守門 =====

  private quotaKey(host: string): string {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // UTC 日界，與 API-Sports 對齊
    return `${QUOTA_KEY_PREFIX}:${host}:${d}`;
  }

  async getQuotaUsed(host: string): Promise<number> {
    return (await this.redis.get<number>(this.quotaKey(host))) ?? 0;
  }

  /** 是否已超每日軟上限（超了 → cron 只跑遠期頻率） */
  async isOverSoftCap(host: string): Promise<boolean> {
    const used = await this.getQuotaUsed(host);
    if (used >= ODDS_DAILY_SOFT_CAP) {
      this.logger.warn(`odds 額度守門觸發：${host} 今日已用 ${used}/${ODDS_DAILY_SOFT_CAP}，降頻至遠期輪`);
      return true;
    }
    return false;
  }

  private async bumpQuota(host: string, calls: number): Promise<void> {
    if (calls <= 0) return;
    const key = this.quotaKey(host);
    const used = (await this.redis.get<number>(key)) ?? 0;
    await this.redis.set(key, used + calls, 26 * 60 * 60); // 存 26h，跨日自然換 key
  }

  // ===== API 呼叫（保留 paging，callApi 模式沿用 sports.service） =====

  private async callApiRaw<T>(
    host: string,
    endpoint: string,
    params: Record<string, string | number>,
  ): Promise<ApiEnvelope<T> | null> {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) query.set(k, String(v));
    const url = `https://${host}${endpoint}?${query.toString()}`;
    try {
      const res = await fetch(url, {
        headers: { 'x-apisports-key': this.apiKey },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        this.logger.error(`API-Sports 回傳 ${res.status}（${endpoint}）`);
        return null;
      }
      const data = (await res.json()) as ApiEnvelope<T>;
      const errs = data.errors;
      if (errs && !Array.isArray(errs) && Object.keys(errs).length > 0) {
        this.logger.warn(`API-Sports 警告（${endpoint}）：${JSON.stringify(errs)}`);
      }
      return data;
    } catch (err) {
      this.logger.error(`API-Sports 呼叫失敗（${endpoint}）：${err}`);
      return null;
    }
  }

  // ===== football：/fixtures 同步賽程（odds 回應沒有隊名/狀態，靠這支補） =====

  private async syncFootballFixtures(board: PredictionBoardConfig): Promise<number> {
    const data = await this.callApiRaw<any[]>(board.apiHost, '/fixtures', {
      league: board.leagueId,
      season: board.season,
      next: FIXTURES_LOOKAHEAD,
    });
    if (!data?.response) return 1;
    for (const item of data.response) {
      const f = parseFootballFixture(item);
      await this.upsertMatch(board, f);
    }
    this.logger.log(`賽程同步（${board.boardSlug}）：${data.response.length} 場`);
    return 1;
  }

  // ===== football：/odds 分頁抓取 =====

  private async fetchFootballOdds(board: PredictionBoardConfig): Promise<number> {
    let calls = 0;
    let page = 1;
    let totalPages = 1;
    let quoteCount = 0;
    do {
      const data = await this.callApiRaw<any[]>(board.apiHost, '/odds', {
        league: board.leagueId,
        season: board.season,
        bookmaker: board.bookmakerId,
        page,
      });
      calls++;
      if (!data?.response) break;
      totalPages = data.paging?.total ?? 1;
      for (const item of data.response) {
        const parsed = parseFootballOddsItem(item, board.bookmakerId, board.markets);
        quoteCount += await this.storeMatchOdds(board, parsed, item);
      }
      page++;
    } while (page <= totalPages);
    this.logger.log(`盤口抓取（${board.boardSlug}）：${calls} 頁、寫入 ${quoteCount} 筆報價`);
    return calls;
  }

  // ===== baseball：/odds 單次回全部（含賽程資訊） =====

  private async fetchBaseballOdds(board: PredictionBoardConfig): Promise<number> {
    const data = await this.callApiRaw<any[]>(board.apiHost, '/odds', {
      league: board.leagueId,
      season: board.season,
      bookmaker: board.bookmakerId,
    });
    if (!data?.response) return 1;
    let quoteCount = 0;
    for (const item of data.response) {
      const parsed = parseBaseballOddsItem(item, board.bookmakerId, board.markets);
      // ⚠️ /odds 視窗含已完賽場次（規格 §2.4 實測）：只同步/寫盤「未開賽」
      if (parsed.apiStatus !== 'NS') continue;
      await this.upsertMatch(board, {
        apiFixtureId: parsed.apiFixtureId,
        startTime: parsed.startTime,
        apiStatus: parsed.apiStatus,
        homeName: parsed.homeName ?? '?',
        awayName: parsed.awayName ?? '?',
      });
      quoteCount += await this.storeMatchOdds(board, parsed, item);
    }
    this.logger.log(`盤口抓取（${board.boardSlug}）：1 次呼叫、寫入 ${quoteCount} 筆報價`);
    return 1;
  }

  // ===== DB 寫入 =====

  private async upsertMatch(
    board: PredictionBoardConfig,
    f: { apiFixtureId: number; startTime: Date; apiStatus: string; homeName: string; awayName: string },
  ): Promise<void> {
    await this.prisma.predictionMatch.upsert({
      where: { boardSlug_apiFixtureId: { boardSlug: board.boardSlug, apiFixtureId: f.apiFixtureId } },
      create: {
        boardSlug: board.boardSlug,
        sportType: board.sportType,
        apiFixtureId: f.apiFixtureId,
        homeName: f.homeName,
        awayName: f.awayName,
        startTime: f.startTime,
        apiStatus: f.apiStatus,
      },
      // cron 同步 = startTime/status 的權威更新路徑（封盤判斷只信 DB，規格 §3.2）
      update: {
        homeName: f.homeName,
        awayName: f.awayName,
        startTime: f.startTime,
        apiStatus: f.apiStatus,
      },
    });
  }

  /** 寫入一場賽事的報價（不可變 quote + 變動翻新），並更新 Redis 顯示快取。回傳寫入/更新筆數。 */
  private async storeMatchOdds(
    board: PredictionBoardConfig,
    parsed: ParsedMatchOdds,
    rawItem: unknown,
  ): Promise<number> {
    if (parsed.quotes.length === 0) return 0;

    const match = await this.prisma.predictionMatch.findUnique({
      where: { boardSlug_apiFixtureId: { boardSlug: board.boardSlug, apiFixtureId: parsed.apiFixtureId } },
      select: { id: true, apiStatus: true, startTime: true },
    });
    // 賽事不在 DB（football odds 視窗比 fixtures lookahead 大時可能發生）→ 跳過，下輪 fixtures 同步到再寫
    if (!match) return 0;
    // 已開賽/完賽不寫盤（football odds 回應無 status，靠 DB 值擋）
    if (match.apiStatus !== 'NS' || match.startTime.getTime() <= Date.now()) return 0;

    const payloadHash = createHash('sha256').update(JSON.stringify(rawItem)).digest('hex').slice(0, 32);
    const now = new Date();
    let written = 0;

    for (const q of parsed.quotes) {
      const existing = await this.prisma.oddsQuote.findFirst({
        where: {
          matchId: match.id,
          market: q.market,
          selection: q.selection,
          line: q.line === null ? null : new Prisma.Decimal(q.line),
          active: true,
        },
        select: { id: true, odds: true },
      });

      if (existing && existing.odds.toNumber() === q.odds) {
        // 賠率沒變：re-confirm 新鮮度（odds/line/selection 維持不可變）
        await this.prisma.oddsQuote.update({
          where: { id: existing.id },
          data: { fetchedAt: now, payloadHash },
        });
      } else {
        await this.prisma.$transaction([
          ...(existing
            ? [this.prisma.oddsQuote.update({ where: { id: existing.id }, data: { active: false } })]
            : []),
          this.prisma.oddsQuote.create({
            data: {
              matchId: match.id,
              bookmakerId: board.bookmakerId,
              market: q.market,
              selection: q.selection,
              line: q.line,
              odds: q.odds,
              fetchedAt: now,
              payloadHash,
            },
          }),
        ]);
      }
      written++;
    }

    await this.writeDisplayCache(board, parsed, match.id);
    return written;
  }

  /** Redis 顯示快取（前端讀這裡；收單不看） */
  private async writeDisplayCache(
    board: PredictionBoardConfig,
    parsed: ParsedMatchOdds,
    matchId: string,
  ): Promise<void> {
    const winlose: Record<string, number> = {};
    const ouByLine = new Map<number, { over?: number; under?: number }>();
    for (const q of parsed.quotes) {
      if (q.market === 'WINLOSE') {
        winlose[q.selection] = q.odds;
      } else if (q.line !== null) {
        const entry = ouByLine.get(q.line) ?? {};
        if (q.selection === 'OVER') entry.over = q.odds;
        if (q.selection === 'UNDER') entry.under = q.odds;
        ouByLine.set(q.line, entry);
      }
    }
    await this.redis.set(
      oddsDisplayKey(board.boardSlug, parsed.apiFixtureId),
      {
        matchId,
        bookmakerId: board.bookmakerId,
        updatedAt: new Date().toISOString(),
        winlose,
        overUnder: [...ouByLine.entries()]
          .map(([line, v]) => ({ line, ...v }))
          .sort((a, b) => a.line - b.line),
      },
      ODDS_DISPLAY_TTL_SEC,
    );
  }
}
