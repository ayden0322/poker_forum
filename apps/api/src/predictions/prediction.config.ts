// P幣競猜 — 聯盟/玩法/bookmaker 設定與管線常數
// 設計依據：《P幣競猜系統-詳細設計規格.md》§2、§9
// 「有哪些旋鈕」在這裡定義；數值之後可搬後台覆蓋（沿用 sports-config 模式）。

import { PredictionMarket } from '@betting-forum/database';

export interface PredictionBoardConfig {
  boardSlug: string;
  sportType: 'football' | 'baseball';
  apiHost: string;
  leagueId: number;
  /** 字串型別：籃球用 "2025-2026" 格式，且 API 是當 query param 傳，數字/字串皆可。 */
  season: number | string;
  /** 此聯盟使用的 bookmaker（William Hill：football=7、baseball=22） */
  bookmakerId: number;
  /** 開放的玩法（MLB 大小分 WH 沒開線 → 只開勝負，見規格 §2.4 實測） */
  markets: PredictionMarket[];
  enabled: boolean;
}

/** 二期上線範圍：足球（世界盃先行）+ MLB。NBA 無盤口延後（規格 §0 定案）。 */
export const PREDICTION_BOARDS: Record<string, PredictionBoardConfig> = {
  // 2026-07-20 下線：世界盃已於 07-19 打完，賽程表無未來場次，開著只會讓 cron 空轉燒額度。
  // ⚠️ 保留設定不刪除：bets.service / markets.service 是用 PREDICTION_BOARDS[boardSlug] 直接查，
  //    刪掉會讓既有世界盃注單與戰績頁查不到板塊設定而炸。enabled=false 只停 cron 與新下注入口。
  //    ⚠️ enabled=false 同時會停掉 settlement.cron 對此板塊的結算 —— 下線前已確認
  //    未結算世界盃賽事 0 場、未結算注單 0 筆，沒有會被卡住的單。下次要開新板塊沿用此檢查。
  'world-cup': {
    boardSlug: 'world-cup',
    sportType: 'football',
    apiHost: 'v3.football.api-sports.io',
    leagueId: 1,
    season: 2026,
    bookmakerId: 7,
    markets: ['WINLOSE', 'OVER_UNDER'],
    enabled: false,
  },
  mlb: {
    boardSlug: 'mlb',
    sportType: 'baseball',
    apiHost: 'v1.baseball.api-sports.io',
    leagueId: 1,
    season: 2026,
    bookmakerId: 22,
    markets: ['WINLOSE'],
    enabled: true,
  },
};

export const enabledBoards = (): PredictionBoardConfig[] =>
  Object.values(PREDICTION_BOARDS).filter((b) => b.enabled);

// ===== 管線節奏（規格 §2.4 分層頻率） =====

/** 開賽前多久進入「近期」高頻抓取（毫秒） */
export const NEAR_WINDOW_MS = 6 * 60 * 60 * 1000;
/** 近期頻率：cron 每 5 分鐘 tick 一次，近期窗內每 tick 都抓 */
export const FAR_INTERVAL_MS = 30 * 60 * 1000;
/** 賽程同步向前看的場次數（football /fixtures?next=N） */
export const FIXTURES_LOOKAHEAD = 40;

// ===== 額度守門（規格 §2.4：超軟上限自動降頻並告警） =====

/** odds 相關呼叫的每日軟上限（單一 API host 各自計） */
export const ODDS_DAILY_SOFT_CAP = 2500;
/** Redis 計數 key 前綴（尾接 host + yyyymmdd，UTC 日界跟 API-Sports 對齊） */
export const QUOTA_KEY_PREFIX = 'prediction:quota:odds';

// ===== 下注收單（規格 §3；數值後台可調為後續增量，先以常數上線） =====

/** 封盤 buffer：開賽前 N 毫秒即停收（cron 粒度內的臨場賠率劇變窗，規格 §3.2 檢查 2） */
export const LOCK_BUFFER_MS = 3 * 60 * 1000;
/** 賠率新鮮度上限：quote 超過此齡觸發 demand-driven 重驗（規格 §2.3） */
export const QUOTE_MAX_AGE_MS = 90 * 1000;
/** 單注上下限（P 幣；綁等級為後續增量） */
export const BET_MIN_STAKE = 100;
export const BET_MAX_STAKE = 10_000;
/** 每人每日投注總額上限（防刷；圓桌防作弊關卡 #6） */
export const DAILY_STAKE_CAP = 50_000;
/** 每人單場單市場累積曝險上限（防對沖刷法單帳號吞吐） */
export const MATCH_MARKET_STAKE_CAP = 20_000;
/** demand-driven 重驗每日預算（每 host；爆了 fail-closed 拒單，規格 §2.3） */
export const REVALIDATE_DAILY_BUDGET = 1_000;
export const REVALIDATE_KEY_PREFIX = 'prediction:quota:revalidate';

// ===== 結算（規格 §4） =====

/** 完賽後寬限期：吃掉大部分官方比分更正窗，期滿才結算 */
export const SETTLE_GRACE_MS = 20 * 60 * 1000;
/** POSTPONED 凍結時長：期滿仍未恢復 → VOIDED 全額退款 */
export const POSTPONE_FREEZE_MS = 12 * 60 * 60 * 1000;

// ===== Redis 顯示快取 =====

/** 顯示快取 TTL：需大於遠期頻率（30 分），否則遠期輪之間會空窗 */
export const ODDS_DISPLAY_TTL_SEC = 40 * 60;
export const oddsDisplayKey = (boardSlug: string, apiFixtureId: number) =>
  `prediction:odds:${boardSlug}:${apiFixtureId}`;
