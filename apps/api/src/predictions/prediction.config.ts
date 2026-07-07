// P幣競猜 — 聯盟/玩法/bookmaker 設定與管線常數
// 設計依據：《P幣競猜系統-詳細設計規格.md》§2、§9
// 「有哪些旋鈕」在這裡定義；數值之後可搬後台覆蓋（沿用 sports-config 模式）。

import { PredictionMarket } from '@betting-forum/database';

export interface PredictionBoardConfig {
  boardSlug: string;
  sportType: 'football' | 'baseball';
  apiHost: string;
  leagueId: number;
  season: number;
  /** 此聯盟使用的 bookmaker（William Hill：football=7、baseball=22） */
  bookmakerId: number;
  /** 開放的玩法（MLB 大小分 WH 沒開線 → 只開勝負，見規格 §2.4 實測） */
  markets: PredictionMarket[];
  enabled: boolean;
}

/** 二期上線範圍：足球（世界盃先行）+ MLB。NBA 無盤口延後（規格 §0 定案）。 */
export const PREDICTION_BOARDS: Record<string, PredictionBoardConfig> = {
  'world-cup': {
    boardSlug: 'world-cup',
    sportType: 'football',
    apiHost: 'v3.football.api-sports.io',
    leagueId: 1,
    season: 2026,
    bookmakerId: 7,
    markets: ['WINLOSE', 'OVER_UNDER'],
    enabled: true,
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

// ===== Redis 顯示快取 =====

/** 顯示快取 TTL：需大於遠期頻率（30 分），否則遠期輪之間會空窗 */
export const ODDS_DISPLAY_TTL_SEC = 40 * 60;
export const oddsDisplayKey = (boardSlug: string, apiFixtureId: number) =>
  `prediction:odds:${boardSlug}:${apiFixtureId}`;
