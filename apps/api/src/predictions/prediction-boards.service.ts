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

  /**
   * 單一板塊設定。兩個刻意的設計：
   *
   * 1. 「不」過濾 predictionEnabled —— 既有注單/戰績頁要查得到已下線板塊的設定。
   *    呼叫端若要擋收單，請自己檢查回傳的 `enabled`（placeBet 與跟單都有擋）。
   *
   * 2. ★「不」解析賽季（2026-07-22 圓桌，tech/red-team/QA 三席一致指出）：
   *    bySlug 位在下注與跟單的熱路徑上（bets.service），原本無條件呼叫 resolveSeason，
   *    Redis 一 miss 就會在使用者的下注請求裡同步打 API-Sports，而那個 fetch 沒有 timeout。
   *    等於把「第三方 API 的可用性」綁進了「能不能下注」。
   *    而這條路徑上根本沒人用 season（已驗證 revalidateMatch 只用 apiHost/sportType/
   *    bookmakerId/markets）——為一個丟掉的值賭上下注可用性，不划算。
   *    賽季解析留在 enabled()（cron 路徑）做，那裡慢一點無所謂。
   */
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
      season: r.season, // 直接用設定值，不打外部 API（見上方說明）
      bookmakerId: r.bookmakerId ?? DEFAULT_BOOKMAKER[r.sportType] ?? 7,
      markets,
      enabled: r.predictionEnabled,
    };
  }

  /**
   * 結算對象 = 開放中的板塊 ∪ 仍有「已開賽但未結算」賽事的板塊（含已下線的）。
   *
   * ★ 為什麼不能直接用 enabled()（2026-07-22 圓桌 red-team 致命傷 [A]）：
   *   結算是「既有債務的履行」，跟「要不要開放新業務」是兩件事。若結算跟著開關走，
   *   管理者在有未結算注單時關掉板塊 → 那些注單永遠停在 PENDING、押注扣掉的 P 幣永遠不回來。
   *   更毒的是這個故障對帳看不出來：reconciliation 的不變量 I2 是「PENDING→期望入帳 0」，
   *   卡死的單期望 0、實際 0，對帳會印「通過」——唯一的財務防線對此是隱形的。
   *   而這批改動剛好把「關板塊」從改 code 降級成後台點一下，風險升高，故結構上解耦。
   */
  async settlementTargets(): Promise<PredictionBoardConfig[]> {
    const on = await this.enabled();
    const seen = new Set(on.map((b) => b.boardSlug));
    const out = [...on];

    // 已開賽但未結算 → 還有債沒還完。只看已開賽的，避免為未來場次白燒 API 額度。
    const debt = await this.prisma.predictionMatch.findMany({
      where: { settledAt: null, startTime: { lt: new Date() } },
      distinct: ['boardSlug'],
      select: { boardSlug: true },
    });

    for (const { boardSlug } of debt) {
      if (seen.has(boardSlug)) continue;
      const cfg = await this.bySlug(boardSlug);
      if (!cfg) {
        this.logger.error(`板塊 ${boardSlug} 有未結算賽事，但 sports_configs 查無此設定 —— 這些注單無法自動結算，需人工處理`);
        continue;
      }
      if (!SUPPORTED_SPORTS.has(cfg.sportType)) continue;
      this.logger.warn(`板塊 ${boardSlug} 競猜已關閉，但仍有未結算賽事 → 續跑結算把債還完`);
      // ★ 這裡必須補賽季解析：bySlug 為了不拖慢下注熱路徑而直接回設定值，
      //   但棒球結算會拿 season 去查 /games（settlement.service.ts:136），
      //   賽季過期就查不到賽果 → 注單照樣卡死，等於繞過上面剛修好的解耦。
      //   這是 cron 路徑，慢一點無所謂。
      out.push({ ...cfg, season: await this.resolveSeason(cfg.apiHost, cfg.leagueId, cfg.sportType, String(cfg.season)) });
      seen.add(boardSlug);
    }
    return out;
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
