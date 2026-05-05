import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis.service';
import { TranslationService } from '../../translation/translation.service';

/**
 * KBO（韓國職棒）官方網站包裝服務
 *
 * 資料來源：https://www.koreabaseball.com/
 *
 * 實作策略：
 * - 排行榜：抓打擊頁（30 筆，按打擊率）+ 投手頁（30 筆，按 ERA）
 *   每個 category 從這 30 筆中按對應 data-id 排序前 10 名
 *   注意：HR 王、SB 王等可能略有偏差（前 30 名打擊率球員未必含全聯盟 HR 王）
 *   季初差異不大，季中後可能需要升級為 ASP.NET PostBack
 * - 球員姓名：原文為韓文，透過 TranslationService 批次翻譯為繁體中文（playerNameZh）
 * - 隊伍縮寫：hardcoded 對照中文
 */
@Injectable()
export class KboStatsService {
  private readonly logger = new Logger(KboStatsService.name);
  private readonly baseUrl = 'https://www.koreabaseball.com';

  constructor(
    private redis: RedisService,
    private translation: TranslationService,
  ) {}

  private async cached<T>(cacheKey: string, ttl: number, fetcher: () => Promise<T | null>): Promise<T | null> {
    const hit = await this.redis.get<T>(cacheKey);
    if (hit) return hit;
    const data = await fetcher();
    if (data) await this.redis.set(cacheKey, data, ttl);
    return data;
  }

  // ============ 排行榜 ============

  async getLeaders(category: KboLeaderCategory): Promise<KboLeaderEntry[] | null> {
    const config = KBO_LEADER_CATEGORIES[category];
    if (!config) return null;

    const cacheKey = `kbo:leaders:${category}`;
    return this.cached(cacheKey, 1800, async () => {
      const rows = await this.fetchAndParseRankingPage(config.position);
      if (!rows || rows.length === 0) return null;

      // 從 30 筆原始資料中按目標欄位排序，取前 10 名
      const sorted = this.sortByField(rows, config.dataId, ('lowerBetter' in config ? config.lowerBetter : false) as boolean);
      const entries: KboLeaderEntry[] = sorted.slice(0, 10).map((r, i) => ({
        rank: i + 1,
        playerName: r.playerName,
        playerId: r.playerId,
        teamCode: r.teamCode,
        teamName: KBO_TEAM_NAMES[r.teamCode] ?? r.teamCode,
        value: r.fields[config.dataId] ?? '',
        category: config.label,
      }));

      // 翻譯球員姓名（韓文 → 繁體中文）
      // 失敗 fallback 回原文，不會 break 排行榜
      try {
        const names = entries.map((e) => e.playerName);
        const translated = await this.translation.translateBaseballPlayerNames(names, 'ko');
        for (const e of entries) {
          e.playerNameZh = translated.get(e.playerName) ?? e.playerName;
        }
      } catch (err) {
        this.logger.warn(`[KBO] 球員姓名翻譯失敗（fallback 原文）：${err}`);
        for (const e of entries) e.playerNameZh = e.playerName;
      }

      return entries;
    });
  }

  /**
   * 抓 KBO 排行榜頁面（打擊或投手）並解析所有 30 筆資料
   */
  private async fetchAndParseRankingPage(position: 'hitter' | 'pitcher'): Promise<KboRowRaw[]> {
    const url =
      position === 'hitter'
        ? `${this.baseUrl}/Record/Player/HitterBasic/Basic1.aspx`
        : `${this.baseUrl}/Record/Player/PitcherBasic/Basic1.aspx`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return [];
      const html = await res.text();
      return this.parseRankingHtml(html);
    } catch (err) {
      this.logger.warn(`[KBO] fetch ${url}：${err}`);
      return [];
    }
  }

  /** 解析 KBO 排行榜 HTML（tbody > tr） */
  private parseRankingHtml(html: string): KboRowRaw[] {
    const rows: KboRowRaw[] = [];

    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!tbodyMatch) return rows;

    const trRegex = /<tr>([\s\S]*?)<\/tr>/g;
    let trMatch;
    while ((trMatch = trRegex.exec(tbodyMatch[1])) !== null) {
      const trContent = trMatch[1];

      // 球員 link：<a href="/Record/Player/HitterDetail/Basic.aspx?playerId=XXXXX">韓文名</a>
      const playerMatch = trContent.match(/<a href="[^"]*playerId=(\d+)[^"]*">([^<]+)<\/a>/);
      if (!playerMatch) continue;
      const playerId = playerMatch[1];
      const playerName = playerMatch[2].trim();

      // 隊伍：第三個 td（無 data-id 的純文字）
      const tdRegex = /<td(?:\s+data-id="([^"]+)")?[^>]*>([\s\S]*?)<\/td>/g;
      const tds: { dataId?: string; value: string }[] = [];
      let tdMatch;
      while ((tdMatch = tdRegex.exec(trContent)) !== null) {
        const value = tdMatch[2].replace(/<[^>]+>/g, '').trim();
        tds.push({ dataId: tdMatch[1], value });
      }

      // tds[0]=排名、tds[1]=姓名、tds[2]=隊伍、tds[3+]=各統計（含 data-id）
      if (tds.length < 4) continue;
      const teamCode = tds[2].value;

      const fields: Record<string, string> = {};
      for (let i = 3; i < tds.length; i++) {
        const t = tds[i];
        if (t.dataId) fields[t.dataId] = t.value;
      }

      rows.push({ playerId, playerName, teamCode, fields });
    }

    return rows;
  }

  /** 按 data-id 欄位排序（高值優先 / 防禦率類低值優先） */
  private sortByField(rows: KboRowRaw[], dataId: string, lowerBetter: boolean): KboRowRaw[] {
    const parseNum = (s: string): number => {
      // 處理 "33 1/3"（投球局數）→ 33.33
      if (s.includes('/')) {
        const m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
        if (m) return parseInt(m[1]) + parseInt(m[2]) / parseInt(m[3]);
      }
      return parseFloat(s.replace(/,/g, '')) || 0;
    };

    return [...rows]
      .filter((r) => {
        const v = parseNum(r.fields[dataId] ?? '0');
        return lowerBetter ? v > 0 : v >= 0;
      })
      .sort((a, b) => {
        const av = parseNum(a.fields[dataId] ?? '0');
        const bv = parseNum(b.fields[dataId] ?? '0');
        return lowerBetter ? av - bv : bv - av;
      });
  }

  // ============ 最新動態 ============

  async getNews(limit = 10): Promise<KboNewsItem[] | null> {
    const cacheKey = `kbo:news:list:${limit}`;
    return this.cached(cacheKey, 1800, async () => {
      try {
        const res = await fetch(`${this.baseUrl}/MediaNews/Notice/List.aspx`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html',
          },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return null;
        const html = await res.text();
        return this.parseNewsList(html, limit);
      } catch (err) {
        this.logger.error(`[KBO News] 失敗：${err}`);
        return null;
      }
    });
  }

  /** 解析 KBO 公告列表 */
  private parseNewsList(html: string, limit: number): KboNewsItem[] {
    const items: KboNewsItem[] = [];

    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!tbodyMatch) return items;

    const trRegex = /<tr>([\s\S]*?)<\/tr>/g;
    let trMatch;
    while ((trMatch = trRegex.exec(tbodyMatch[1])) !== null && items.length < limit) {
      const trContent = trMatch[1];

      // 標題 + 連結
      const titleMatch = trContent.match(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!titleMatch) continue;
      const [, href, titleRaw] = titleMatch;
      const title = titleRaw.replace(/<[^>]+>/g, '').trim();
      if (!title) continue;

      // 日期：通常在最後一個 td（YYYY.MM.DD 或 YYYY-MM-DD）
      const dateMatches = [...trContent.matchAll(/(\d{4})[.-](\d{1,2})[.-](\d{1,2})/g)];
      const date = dateMatches.length > 0
        ? `${dateMatches[0][1]}/${dateMatches[0][2].padStart(2, '0')}/${dateMatches[0][3].padStart(2, '0')}`
        : '';

      items.push({
        date,
        title,
        url: href.startsWith('http') ? href : `${this.baseUrl}${href.startsWith('/') ? '' : '/'}${href}`,
      });
    }

    return items;
  }
}

// ============ 排行榜分類映射 ============

interface LeaderCategoryConfig {
  position: 'hitter' | 'pitcher';
  dataId: string;
  label: string;
  unit?: string;
  lowerBetter?: boolean;
}

export const KBO_LEADER_CATEGORIES = {
  // 打擊類
  battingAverage: { position: 'hitter', dataId: 'HRA_RT', label: '打擊率', unit: '' },
  rbi:            { position: 'hitter', dataId: 'RBI_CN', label: '打點', unit: '分' },
  hits:           { position: 'hitter', dataId: 'HIT_CN', label: '安打', unit: '支' },
  homeRuns:       { position: 'hitter', dataId: 'HR_CN',  label: '全壘打', unit: '轟' },
  stolenBases:    { position: 'hitter', dataId: 'SB_CN',  label: '盜壘', unit: '盜' },
  // 投手類
  era:            { position: 'pitcher', dataId: 'ERA_RT', label: '防禦率', unit: '', lowerBetter: true },
  wins:           { position: 'pitcher', dataId: 'W_CN',   label: '勝投', unit: '勝' },
  saves:          { position: 'pitcher', dataId: 'SV_CN',  label: '救援', unit: 'S' },
  holds:          { position: 'pitcher', dataId: 'HOLD_CN', label: '中繼', unit: 'H' },
  strikeouts:     { position: 'pitcher', dataId: 'KK_CN',  label: '三振', unit: 'K' },
} as const satisfies Record<string, LeaderCategoryConfig>;

export type KboLeaderCategory = keyof typeof KBO_LEADER_CATEGORIES;

// ============ 隊名對照 ============

const KBO_TEAM_NAMES: Record<string, string> = {
  KIA:    'KIA 老虎',
  '두산':  '斗山熊',
  '키움':  'Kiwoom 英雄',
  LG:     'LG 雙子',
  '삼성':  '三星獅',
  KT:     'KT 巫師',
  '롯데':  '樂天巨人',
  '한화':  '韓華鷹',
  NC:     'NC 恐龍',
  SSG:    'SSG 蘭德斯',
};

// ============ 型別 ============

interface KboRowRaw {
  playerId: string;
  playerName: string;
  teamCode: string;
  fields: Record<string, string>;
}

export interface KboLeaderEntry {
  rank: number;
  playerName: string;        // 原文（韓文）
  playerNameZh?: string;     // 繁體中文（翻譯失敗時 fallback 為原文）
  playerId: string;
  teamCode: string;
  teamName: string;
  value: string;
  category: string;
}

export interface KboNewsItem {
  date: string;
  title: string;
  url: string;
}
