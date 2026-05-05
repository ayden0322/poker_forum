import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis.service';
import { TranslationService } from '../../translation/translation.service';

/**
 * NPB（日本職棒）官方網站包裝服務
 *
 * 資料來源：https://npb.jp/
 * 特色：免費、HTML 純解析、無需 token、IP 不擋
 *
 * 排行榜結構：
 *   /bis/{year}/stats/lb_{cat}_{league}.html  打擊類（c=央聯, p=太平洋）
 *   /bis/{year}/stats/lp_{cat}_{league}.html  投手類
 *   每個分類獨立頁，2 聯盟合併取前 N 名
 */
@Injectable()
export class NpbStatsService {
  private readonly logger = new Logger(NpbStatsService.name);
  private readonly baseUrl = 'https://npb.jp';

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

  /**
   * 取得 NPB 賽季排行榜（兩聯盟合併取前 N 名）
   *
   * @param category 分類（與 CPBL 一致：homeRuns / battingAverage / rbi / ...）
   * @param year 年度（預設今年；若該年資料未發佈，自動 fallback 到去年）
   */
  async getLeaders(category: NpbLeaderCategory, year?: number): Promise<NpbLeaderEntry[] | null> {
    const targetYear = year ?? new Date().getFullYear();
    const config = NPB_LEADER_CATEGORIES[category];
    if (!config) return null;

    const cacheKey = `npb:leaders:${targetYear}:${category}`;
    return this.cached(cacheKey, 1800, async () => {
      // 平行抓兩聯盟
      const [centralRows, pacificRows] = await Promise.all([
        this.fetchLeagueRanking(targetYear, config.urlSlug, 'c'),
        this.fetchLeagueRanking(targetYear, config.urlSlug, 'p'),
      ]);

      // 若當年無資料（季初或非賽季）→ fallback 上一年
      let entries: NpbLeaderEntry[];
      if ((centralRows?.length ?? 0) === 0 && (pacificRows?.length ?? 0) === 0 && !year) {
        const fallback = await Promise.all([
          this.fetchLeagueRanking(targetYear - 1, config.urlSlug, 'c'),
          this.fetchLeagueRanking(targetYear - 1, config.urlSlug, 'p'),
        ]);
        entries = this.mergeAndRank(fallback[0] ?? [], fallback[1] ?? [], category, targetYear - 1);
      } else {
        entries = this.mergeAndRank(centralRows ?? [], pacificRows ?? [], category, targetYear);
      }

      // 翻譯球員姓名（日文 → 繁體中文）
      // 失敗 fallback 回原文，不會 break 排行榜
      try {
        const names = entries.map((e) => e.playerName);
        const translated = await this.translation.translateBaseballPlayerNames(names, 'ja');
        for (const e of entries) {
          e.playerNameZh = translated.get(e.playerName) ?? e.playerName;
        }
      } catch (err) {
        this.logger.warn(`[NPB] 球員姓名翻譯失敗（fallback 原文）：${err}`);
        for (const e of entries) e.playerNameZh = e.playerName;
      }

      return entries;
    });
  }

  /** 抓單一聯盟的排行榜頁面並解析 */
  private async fetchLeagueRanking(
    year: number,
    urlSlug: string,
    leagueCode: 'c' | 'p',
  ): Promise<NpbRowRaw[]> {
    const url = `${this.baseUrl}/bis/${year}/stats/${urlSlug}_${leagueCode}.html`;
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
      return this.parseRankingHtml(html, leagueCode);
    } catch (err) {
      this.logger.warn(`[NPB] fetch ${url}：${err}`);
      return [];
    }
  }

  /**
   * 解析 NPB 排行榜 HTML
   *
   * 結構：<tr class="ststats">
   *         <td>排名</td>
   *         <td>姓名(隊伍縮寫)</td>
   *         <td>數值</td>
   *       </tr>
   */
  private parseRankingHtml(html: string, leagueCode: 'c' | 'p'): NpbRowRaw[] {
    const rows: NpbRowRaw[] = [];
    const trRegex = /<tr class="ststats">([\s\S]*?)<\/tr>/g;
    let match;
    while ((match = trRegex.exec(html)) !== null) {
      const tds = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].trim());
      if (tds.length < 3) continue;

      const rank = parseInt(tds[0], 10);
      if (isNaN(rank)) continue;

      // tds[1] 形如 "佐藤　輝明(神)" 或 "ペラルタ(中)"
      const nameTeamMatch = tds[1].match(/^([\s\S]*?)\(([^)]+)\)$/);
      const playerName = nameTeamMatch ? nameTeamMatch[1].trim() : tds[1].trim();
      const teamCode = nameTeamMatch ? nameTeamMatch[2].trim() : '';

      rows.push({
        rank,
        playerName,
        teamCode,
        teamName: NPB_TEAM_NAMES[teamCode] ?? teamCode,
        value: tds[2].trim(),
        leagueCode,
      });
    }
    return rows;
  }

  /** 兩聯盟合併、按值排序、重新編排排名（取前 10 名） */
  private mergeAndRank(
    central: NpbRowRaw[],
    pacific: NpbRowRaw[],
    category: NpbLeaderCategory,
    year: number,
  ): NpbLeaderEntry[] {
    const config = NPB_LEADER_CATEGORIES[category];
    const all = [...central, ...pacific];

    // 解析數值（防禦率/打擊率是浮點，其餘是整數）
    const isFloat = ['battingAverage', 'era', 'slg', 'obp'].includes(category);
    const isLowerBetter = ['era'].includes(category);

    const withNumeric = all
      .map((r) => ({
        ...r,
        numericValue: parseFloat(r.value.replace(/,/g, '')) || 0,
      }))
      .filter((r) => isFloat ? r.numericValue > 0 : r.numericValue !== 0);

    // 排序：低值優先（防禦率）vs 高值優先（其餘）
    withNumeric.sort((a, b) =>
      isLowerBetter ? a.numericValue - b.numericValue : b.numericValue - a.numericValue,
    );

    return withNumeric.slice(0, 10).map((r, i) => ({
      rank: i + 1,
      playerName: r.playerName,
      teamCode: r.teamCode,
      teamName: r.teamName,
      league: r.leagueCode === 'c' ? '央聯' : '太平洋',
      value: r.value,
      category: config.label,
      year,
    }));
  }

  // ============ 最新動態（NPB 新聞）============

  /**
   * 取得 NPB 最新新聞列表
   *
   * 來源：https://npb.jp/news/
   */
  async getNews(limit = 10): Promise<NpbNewsItem[] | null> {
    const cacheKey = `npb:news:list:${limit}`;
    return this.cached(cacheKey, 1800, async () => {
      try {
        // /news/ 是 meta refresh 重導向到 /news/npb_all.html
        const res = await fetch(`${this.baseUrl}/news/npb_all.html`, {
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
        this.logger.error(`[NPB News] 失敗：${err}`);
        return null;
      }
    });
  }

  /**
   * 解析 NPB 新聞列表
   *
   * NPB news 頁面結構：
   *   <dl>
   *     <dt class="news_cate"><img alt="分類"><time>2026年4月27日</time></dt>
   *     <dd><a href="/news/detail/...">標題</a></dd>
   *   </dl>
   */
  private parseNewsList(html: string, limit: number): NpbNewsItem[] {
    const items: NpbNewsItem[] = [];

    // 抓所有 dl 區塊
    const dlRegex = /<dl>([\s\S]*?)<\/dl>/g;
    let dlMatch;
    while ((dlMatch = dlRegex.exec(html)) !== null && items.length < limit) {
      const dlBlock = dlMatch[1];

      // 抓 alt（分類）
      const categoryMatch = dlBlock.match(/<img[^>]+alt="([^"]+)"/);
      const category = categoryMatch?.[1]?.trim();

      // 抓 time（日期）
      const timeMatch = dlBlock.match(/<time[^>]*>([^<]+)<\/time>/);
      const date = timeMatch?.[1]?.trim();

      // 抓 dd > a
      const linkMatch = dlBlock.match(/<dd>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!linkMatch || !date) continue;

      const [, href, titleRaw] = linkMatch;
      const title = titleRaw.replace(/<[^>]+>/g, '').trim();
      if (!title) continue;

      items.push({
        date: this.formatNpbDate(date),
        title,
        url: href.startsWith('http') ? href : `https://npb.jp${href}`,
        category,
      });
    }

    return items;
  }

  private formatNpbDate(dateStr: string): string {
    // 2025年4月25日 → 2025/04/25
    const m = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (m) {
      const [, y, mo, d] = m;
      return `${y}/${mo.padStart(2, '0')}/${d.padStart(2, '0')}`;
    }
    return dateStr;
  }
}

// ============ 排行榜分類映射 ============

interface LeaderCategoryConfig {
  urlSlug: string; // 如 'lb_hr', 'lp_era'
  label: string;
  unit?: string;
}

export const NPB_LEADER_CATEGORIES = {
  // 打擊類（lb_*）
  battingAverage: { urlSlug: 'lb_avg', label: '打率', unit: '' },
  rbi:            { urlSlug: 'lb_rbi', label: '打點', unit: '分' },
  hits:           { urlSlug: 'lb_h',   label: '安打', unit: '支' },
  homeRuns:       { urlSlug: 'lb_hr',  label: '本塁打', unit: '轟' },
  stolenBases:    { urlSlug: 'lb_sb',  label: '盜壘', unit: '盜' },
  // 投手類（lp_*）
  era:            { urlSlug: 'lp_era', label: '防御率', unit: '' },
  wins:           { urlSlug: 'lp_w',   label: '勝投', unit: '勝' },
  saves:          { urlSlug: 'lp_sv',  label: '救援', unit: 'S' },
  holds:          { urlSlug: 'lp_hld', label: '中繼', unit: 'H' },
  strikeouts:     { urlSlug: 'lp_so',  label: '奪三振', unit: 'K' },
} as const satisfies Record<string, LeaderCategoryConfig>;

export type NpbLeaderCategory = keyof typeof NPB_LEADER_CATEGORIES;

// ============ NPB 隊名對照表（縮寫 → 中文）============

const NPB_TEAM_NAMES: Record<string, string> = {
  // 央聯（Central League）
  '巨': '讀賣巨人',
  '神': '阪神虎',
  '広': '廣島東洋鯉魚',
  '中': '中日龍',
  'ヤ': '養樂多燕子',
  'デ': '橫濱DeNA',
  // 太平洋聯盟（Pacific League）
  'ソ': '軟銀鷹',
  '日': '日本火腿鬥士',
  '楽': '樂天金鷲',
  'ロ': '羅德海洋',
  '西': '西武獅',
  'オ': '歐力士',
};

// ============ 型別 ============

interface NpbRowRaw {
  rank: number;
  playerName: string;
  teamCode: string;
  teamName: string;
  value: string;
  leagueCode: 'c' | 'p';
}

export interface NpbLeaderEntry {
  rank: number;
  playerName: string;        // 原文（日文漢字 / 片假名）
  playerNameZh?: string;     // 繁體中文（翻譯失敗時 fallback 為原文）
  teamCode: string;
  teamName: string;
  league: string;
  value: string;
  category: string;
  year: number;
}

export interface NpbNewsItem {
  date: string;
  title: string;
  url: string;
  category?: string;
}
