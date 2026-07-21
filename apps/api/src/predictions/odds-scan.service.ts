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

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';

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
const OU_NAMES = new Set(['Goals Over/Under', 'Over/Under']);

@Injectable()
export class OddsScanService {
  private readonly logger = new Logger(OddsScanService.name);
  private readonly apiKey: string;

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    this.apiKey = config.get<string>('API_SPORTS_KEY', '');
  }

  /** 掃描全部（或指定）聯賽，寫回 sports_configs 並回傳結果。 */
  async scanAll(boardSlugs?: string[]): Promise<ScanRow[]> {
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
  }): Promise<ScanRow> {
    const base: ScanRow = {
      boardSlug: cfg.boardSlug, displayName: cfg.displayName, sportType: cfg.sportType,
      season: cfg.season, available: false, futureCount: 0, note: '', markets: [], bookmakers: [],
    };
    if (!this.apiKey) return { ...base, note: 'API_SPORTS_KEY 未設定' };

    const meta = await this.currentSeason(cfg.apiHost, cfg.leagueId, cfg.sportType);
    const season = meta.season ?? cfg.season;

    const first = await this.call(cfg.apiHost, 'odds', { league: cfg.leagueId, season });
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
      ? await this.call(cfg.apiHost, 'odds', { league: cfg.leagueId, season, page: totalPages })
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

  private async call(host: string, path: string, params: Record<string, unknown>) {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)] as [string, string]),
    ).toString();
    try {
      const res = await fetch(`https://${host}/${path}?${qs}`, { headers: { 'x-apisports-key': this.apiKey } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (await res.json()) as any;
    } catch (e) {
      this.logger.warn(`掃描呼叫失敗 ${host}/${path}：${(e as Error).message}`);
      return null;
    }
  }
}
