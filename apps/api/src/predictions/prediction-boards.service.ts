// 競猜板塊設定 — 資料來源由「寫死的 prediction.config.ts」改為「後台 sports_configs」。
//
// 為什麼要搬：每加一個聯賽都要改程式碼＋重新部署（世界盃下線就是這樣做的）。
// 搬進資料庫後，管理者在 /sports-settings 開關即可，攬客部門要什麼賽事就開什麼。
//
// 三個刻意的防呆：
//  1. 只回傳「管線真的支援」的運動（目前 football / baseball）——後台就算開了籃球也不會讓 cron 壞掉
//  2. 賽季自動解析：不信任 sports_configs.season（實測那些值已過期，英超寫 2025、CBA 停在 2014-2015）
//  3. 記憶體快取 60 秒：cron 每 5 分鐘掃全部板塊，不該每次都打 DB

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { PredictionBoardConfig } from './prediction.config';
import { PredictionMarket } from '@betting-forum/database';

/** 賠率管線目前實作的運動。籃球需先補 parseBasketballOddsItem 與結算判定才能加進來。 */
const SUPPORTED_SPORTS = new Set(['football', 'baseball']);

/** 各運動的 William Hill bookmaker id 不同（實測：足球 7、棒球 22、籃球 26）。 */
const DEFAULT_BOOKMAKER: Record<string, number> = { football: 7, baseball: 22, basketball: 26 };

const BOARD_CACHE_MS = 60_000;
const SEASON_CACHE_SEC = 12 * 3600; // 賽季一年才換一次，快取久一點省額度

@Injectable()
export class PredictionBoardsService {
  private readonly logger = new Logger(PredictionBoardsService.name);
  private readonly apiKey: string;
  private cache: { at: number; boards: PredictionBoardConfig[] } | null = null;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    config: ConfigService,
  ) {
    this.apiKey = config.get<string>('API_SPORTS_KEY', '');
  }

  /** 目前開放競猜的板塊（已過濾管線不支援的運動）。 */
  async enabled(): Promise<PredictionBoardConfig[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < BOARD_CACHE_MS) return this.cache.boards;

    const rows = await this.prisma.sportsConfig.findMany({
      where: { predictionEnabled: true, enabled: true },
      orderBy: { boardSlug: 'asc' },
    });

    const boards: PredictionBoardConfig[] = [];
    for (const r of rows) {
      if (!SUPPORTED_SPORTS.has(r.sportType)) {
        // 後台開了但管線吃不下 → 略過並出聲，不要靜默壞掉
        this.logger.warn(`板塊 ${r.boardSlug}（${r.sportType}）已開競猜，但賠率管線尚未支援此運動，略過`);
        continue;
      }
      const markets = (r.predictionMarkets ?? []).filter((m): m is PredictionMarket =>
        m === 'WINLOSE' || m === 'OVER_UNDER',
      );
      if (!markets.length) {
        this.logger.warn(`板塊 ${r.boardSlug} 已開競猜但沒有設定任何玩法，略過`);
        continue;
      }
      boards.push({
        boardSlug: r.boardSlug,
        sportType: r.sportType as 'football' | 'baseball',
        apiHost: r.apiHost,
        leagueId: r.leagueId,
        season: await this.resolveSeason(r.apiHost, r.leagueId, r.sportType, r.season),
        bookmakerId: r.bookmakerId ?? DEFAULT_BOOKMAKER[r.sportType] ?? 7,
        markets,
        enabled: true,
      });
    }

    this.cache = { at: now, boards };
    return boards;
  }

  /** 單一板塊設定。注意：這裡「不」過濾 predictionEnabled —— 既有注單/戰績頁要查得到已下線板塊的設定。 */
  async bySlug(boardSlug: string): Promise<PredictionBoardConfig | null> {
    const r = await this.prisma.sportsConfig.findUnique({ where: { boardSlug } });
    if (!r) return null;
    const markets = (r.predictionMarkets ?? []).filter((m): m is PredictionMarket =>
      m === 'WINLOSE' || m === 'OVER_UNDER',
    );
    return {
      boardSlug: r.boardSlug,
      sportType: r.sportType as 'football' | 'baseball',
      apiHost: r.apiHost,
      leagueId: r.leagueId,
      season: await this.resolveSeason(r.apiHost, r.leagueId, r.sportType, r.season),
      bookmakerId: r.bookmakerId ?? DEFAULT_BOOKMAKER[r.sportType] ?? 7,
      markets,
      enabled: r.predictionEnabled,
    };
  }

  /** 讓後台存檔後立刻生效，不必等 60 秒快取過期。 */
  invalidate(): void {
    this.cache = null;
  }

  /**
   * 解析「當前賽季」。
   * 為什麼不直接用設定值：實測 sports_configs.season 已過期（英超 2025／歐冠 2025），
   * 用它去抓會得到 0 筆盤口卻不會報錯——靜默失效最難查。
   * API 失敗時回退設定值（fail-soft：寧可用舊值，也不要整個板塊消失）。
   */
  private async resolveSeason(apiHost: string, leagueId: number, sportType: string, fallback: string): Promise<string> {
    const key = `prediction:season:${apiHost}:${leagueId}`;
    const cached = await this.redis.get<string>(key);
    if (cached) return cached;
    if (!this.apiKey) return fallback;

    try {
      const res = await fetch(`https://${apiHost}/leagues?id=${leagueId}`, {
        headers: { 'x-apisports-key': this.apiKey },
      });
      const data = (await res.json()) as { response?: Array<{ seasons?: Array<Record<string, unknown>> }> };
      const item = data.response?.[0];
      const seasons = item?.seasons ?? [];
      const cur = seasons.find((s) => s.current === true) ?? seasons[seasons.length - 1];
      // football 用 year、baseball/basketball 用 season
      const val = cur ? String(cur[sportType === 'football' ? 'year' : 'season'] ?? '') : '';
      if (!val) return fallback;
      if (val !== fallback) {
        this.logger.log(`板塊 league=${leagueId} 賽季自動校正：設定值 ${fallback} → 實際當季 ${val}`);
      }
      await this.redis.set(key, val, SEASON_CACHE_SEC);
      return val;
    } catch (e) {
      this.logger.warn(`賽季解析失敗（league=${leagueId}），回退設定值 ${fallback}：${(e as Error).message}`);
      return fallback;
    }
  }
}
