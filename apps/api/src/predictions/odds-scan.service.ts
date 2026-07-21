// 盤口可用性掃描：對每個聯賽實測 API-Sports 現在到底有沒有賠率，結果寫回 sports_configs。
//
// 為什麼需要這支：後台可以開任何聯賽，但「開得起來」不等於「抓得到盤口」。
// 沒有這支，管理者只能開了之後等空板塊 + 白燒額度才發現。
//
// 兩個實測踩到的坑（都寫成程式碼裡的規則，別再踩）：
//  1. /leagues 的 coverage.odds 旗標不可信 —— 英超近 6 季全回 false，但英超實際有盤口。
//     所以一律實打 /odds，不看旗標。
//  2. /odds 分頁且按日期升冪 —— 只看第一頁會全是過去場次，導致誤判「無未來場次」。
//     歐冠就是這樣被誤判成休賽期（實際未來 5 天有 13 場）。故必須看最後一頁。

import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { QUOTA_KEY_PREFIX } from './prediction.config';

export interface ScanRow {
  boardSlug: string;
  displayName: string;
  sportType: string;
  season: string;
  available: boolean;
  futureCount: number;
  note: string;
  markets: string[]; // 實測有的玩法（對應我們的 WINLOSE / OVER_UNDER）
  bookmakers: Array<{ id: number; name: string }>;
}

/** 各運動「勝負」「大小分」的玩法名稱不同 */
const WINLOSE_NAMES = new Set(['Match Winner', 'Home/Away', '3Way Result']);
/** 與 PredictionBoardsService 同一份預設值：足球 William Hill=7、棒球=22、籃球=26 */
const DEFAULT_BOOKMAKER: Record<string, number> = { football: 7, baseball: 22, basketball: 26 };
/** 單次掃描的外部呼叫逾時：40 個聯賽序列跑，任一個吊住就會撞 gateway timeout */
const CALL_TIMEOUT_MS = 8000;
const OU_NAMES = new Set(['Goals Over/Under', 'Over/Under']);

@Injectable()
export class OddsScanService {
  private readonly logger = new Logger(OddsScanService.name);
  private readonly apiKey: string;

  /** 併發鎖：兩個管理員同時點、或同一人連點，會變成併發全掃（沿用 settlement/pipeline 的 in-flight 模式）*/
  private scanning = false;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    config: ConfigService,
  ) {
    this.apiKey = config.get<string>('API_SPORTS_KEY', '');
  }

  /** 掃描全部（或指定）聯賽，寫回 sports_configs 並回傳結果。 */
  async scanAll(boardSlugs?: string[]): Promise<ScanRow[]> {
    if (this.scanning) {
      throw new ConflictException('盤口掃描進行中，請稍候再試');
    }
    this.scanning = true;
    try {
      return await this.runScan(boardSlugs);
    } finally {
      this.scanning = false;
    }
  }

  private async runScan(boardSlugs?: string[]): Promise<ScanRow[]> {
    const rows = await this.prisma.sportsConfig.findMany({
      where: boardSlugs?.length ? { boardSlug: { in: boardSlugs } } : {},
      orderBy: [{ sportType: 'asc' }, { boardSlug: 'asc' }],
    });

    const out: ScanRow[] = [];
    for (const cfg of rows) {
      const r = await this.scanOne(cfg);
      out.push(r);
      await this.prisma.sportsConfig.update({
        where: { boardSlug: cfg.boardSlug },
        data: {
          oddsAvailable: r.available,
          oddsFutureCount: r.futureCount,
          oddsCheckedAt: new Date(),
          oddsNote: r.note,
        },
      });
    }
    this.logger.log(`盤口掃描完成：${out.length} 個聯賽，其中 ${out.filter((x) => x.available).length} 個現在可開`);
    return out;
  }

  private async scanOne(cfg: {
    boardSlug: string; displayName: string; sportType: string; apiHost: string; leagueId: number; season: string;
    bookmakerId: number | null;
  }): Promise<ScanRow> {
    const base: ScanRow = {
      boardSlug: cfg.boardSlug, displayName: cfg.displayName, sportType: cfg.sportType,
      season: cfg.season, available: false, futureCount: 0, note: '', markets: [], bookmakers: [],
    };
    if (!this.apiKey) return { ...base, note: 'API_SPORTS_KEY 未設定' };

    const meta = await this.currentSeason(cfg.apiHost, cfg.leagueId, cfg.sportType);
    const season = meta.season ?? cfg.season;

    // ★ 必須帶 bookmaker（2026-07-22 圓桌 Codex 指出）：
    //   實際賠率管線只認單一莊家（odds-pipeline 的 bookmaker: board.bookmakerId）。
    //   掃描若不帶 bookmaker，會聚合「所有莊家」的盤口 → 別家有盤、我們用的那家沒有時，
    //   後台顯示綠色「盤口 N 場」，開下去卻是空板塊。
    //   掃描的存在意義就是防止這種空開，自己給假訊號等於白做。
    const bookmaker = cfg.bookmakerId ?? DEFAULT_BOOKMAKER[cfg.sportType];
    const first = await this.call(cfg.apiHost, 'odds', { league: cfg.leagueId, season, bookmaker });
    if (!first) return { ...base, season, note: '查詢失敗' };
    if (!first.results) {
      // 分辨「賽季中但沒盤口」與「休賽期」——兩者的處置完全不同
      const inSeason = this.inSeason(meta.start, meta.end);
      return {
        ...base, season,
        note: inSeason ? '賽季進行中但無盤口（此聯賽不提供賠率）' : `休賽期（${meta.start ?? '?'} ~ ${meta.end ?? '?'}）`,
      };
    }

    // 分頁按日期升冪 → 未來場次在最後一頁
    const totalPages: number = first.paging?.total ?? 1;
    const page = totalPages > 1
      ? await this.call(cfg.apiHost, 'odds', { league: cfg.leagueId, season, bookmaker, page: totalPages })
      : first;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    let future = 0;
    const betNames = new Set<string>();
    const bms = new Map<number, string>();
    for (const item of page?.response ?? []) {
      const node = cfg.sportType === 'football' ? item.fixture : item.game;
      const d = node?.date ? new Date(node.date) : null;
      if (d && d >= today) future++;
      for (const b of item.bookmakers ?? []) {
        bms.set(b.id, b.name);
        for (const bet of b.bets ?? []) betNames.add(bet.name);
      }
    }

    const markets: string[] = [];
    if ([...betNames].some((n) => WINLOSE_NAMES.has(n))) markets.push('WINLOSE');
    if ([...betNames].some((n) => OU_NAMES.has(n))) markets.push('OVER_UNDER');

    return {
      ...base, season, markets,
      bookmakers: [...bms].map(([id, name]) => ({ id, name })),
      available: future > 0,
      futureCount: future,
      note: future > 0 ? `可開：未來 ${future} 場有盤口` : '有歷史盤口但目前無未來場次',
    };
  }

  private inSeason(start?: string, end?: string): boolean {
    if (!start || !end) return false;
    const now = Date.now();
    return new Date(start).getTime() <= now && now <= new Date(end).getTime();
  }

  private async currentSeason(apiHost: string, leagueId: number, sportType: string) {
    const d = await this.call(apiHost, 'leagues', { id: leagueId });
    const item = d?.response?.[0];
    const seasons = item?.seasons ?? [];
    const cur = seasons.find((s: Record<string, unknown>) => s.current === true) ?? seasons[seasons.length - 1];
    if (!cur) return { season: null as string | null, start: undefined, end: undefined };
    return {
      season: String(cur[sportType === 'football' ? 'year' : 'season'] ?? ''),
      start: cur.start as string | undefined,
      end: cur.end as string | undefined,
    };
  }

  /** 與 odds-pipeline 共用同一把 quota key，否則掃描的用量對 isOverSoftCap() 是隱形的 */
  private async bumpQuota(host: string, calls: number): Promise<void> {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await this.redis.incrWithTtl(`${QUOTA_KEY_PREFIX}:${host}:${day}`, 26 * 60 * 60, calls);
  }

  private async call(host: string, path: string, params: Record<string, unknown>) {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)] as [string, string]),
    ).toString();
    try {
      const res = await fetch(`https://${host}/${path}?${qs}`, {
        headers: { 'x-apisports-key': this.apiKey },
        // 沒有 timeout 的話單一請求可能吊住數分鐘 → 管理者以為失敗又點一次 → 額度加倍燒
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      // 掃描的每一次外呼都要計進既有額度守門，否則 isOverSoftCap() 會低估用量而說謊
      await this.bumpQuota(host, 1);
      if (!res.ok) {
        this.logger.warn(`掃描呼叫非 2xx ${host}/${path}：HTTP ${res.status}`);
        return null;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = (await res.json()) as any;
      // API-Sports 對配額用盡/參數錯誤仍回 200 + errors 物件，不能當正常結果寫回 DB
      const err = json?.errors;
      if (err && (Array.isArray(err) ? err.length : Object.keys(err).length)) {
        this.logger.warn(`掃描呼叫回報錯誤 ${host}/${path}：${JSON.stringify(err)}`);
        return null;
      }
      return json;
    } catch (e) {
      this.logger.warn(`掃描呼叫失敗 ${host}/${path}：${(e as Error).message}`);
      return null;
    }
  }
}
