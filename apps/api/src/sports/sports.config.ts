/** API-Sports 各運動的 base host */
export const API_HOSTS = {
  football: 'v3.football.api-sports.io',
  basketball: 'v1.basketball.api-sports.io',
  baseball: 'v1.baseball.api-sports.io',
} as const;

export type SportType = 'football' | 'basketball' | 'baseball';

/** 資料來源（源無關能力宣告的實際提供者） */
export type DataSource = 'espn' | 'apisports' | 'tpbl-official' | 'pba-official';

/**
 * 聯賽能力宣告（**源無關**，描述「這個板塊能顯示哪些 widget」，
 * 不是「API-Sports 回了什麼 flag」）。前端通用 widget 依此決定渲染內容，
 * 避免做出「呼叫了一直回空」的死碼。
 *
 * ⚠️ 資料截至 2026-06，逐季會變，需定期核對（見 籃球聯賽補齊計畫 文件）。
 */
export interface LeagueCapabilities {
  standings: boolean; // 排行榜
  schedule: boolean; // 賽程 + 比賽結果（比分/分節）
  boxScore: boolean; // 單場球隊/球員統計
  players: boolean; // 球員名單 / 球員頁
  odds: boolean; // 賠率（競猜用）
  live: boolean; // 即時輪詢直播
}

interface LeagueConfig {
  sportType: SportType;
  displayName: string;
  apiHost: string;
  leagueId: number;
  season: string | number;
  /** 資料來源；未指定時預設 apisports（足球/棒球既有項目沿用舊行為） */
  dataSource?: DataSource;
  /** 能力宣告；未指定時前端視為「未知能力」，由各自 bespoke 模組處理（NBA/MLB） */
  capabilities?: LeagueCapabilities;
}

/** 能力宣告速記工廠：依資料深度級別快速產生 capabilities
 *
 * live 預設 true：業主要求「以資訊完整為導向、API-Sports 配額不用省」（2026-06-10），
 * 故所有有賽程的聯賽預設開即時輪詢。實際輪詢頻率由 service/cron 層決定。
 */
const caps = (
  o: Partial<LeagueCapabilities> & Pick<LeagueCapabilities, 'standings' | 'schedule'>,
): LeagueCapabilities => ({
  boxScore: false,
  players: false,
  odds: false,
  live: true,
  ...o,
});

/** Board slug → 聯賽設定對應（程式碼預設值，可被 DB SportsConfig 覆蓋） */
export const LEAGUE_CONFIG: Record<string, LeagueConfig> = {
  // 籃球（league ID 來自 v1.basketball.api-sports.io/leagues；capabilities/season 截至 2026-06 實測）
  // — 全套能力速記：A=有賠率 B=完整球員數據無賠率 C=只有排行+賽程結果
  // NBA 走 ESPN 免費特例（bespoke 模組，非通用 widget），標 capabilities 供前端統一判斷
  nba:              { sportType: 'basketball', displayName: 'NBA', apiHost: API_HOSTS.basketball, leagueId: 12, season: '2025-2026',
                      dataSource: 'espn', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true, live: true }) },

  // 國際賽（國家隊；league 281 含資格賽 2024~2026 + 2027 正賽，現階段皆資格賽）
  'fiba-wc-qualifiers': { sportType: 'basketball', displayName: 'FIBA 世界盃資格賽', apiHost: API_HOSTS.basketball, leagueId: 281, season: '2027',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true }) },

  // 台灣
  'p-league-plus':  { sportType: 'basketball', displayName: 'P.League+', apiHost: API_HOSTS.basketball, leagueId: 403, season: '2025-2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true, odds: true }) },
  tpbl:             { sportType: 'basketball', displayName: 'TPBL', apiHost: API_HOSTS.basketball, leagueId: 427, season: '2025-2026',
                      dataSource: 'tpbl-official', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true }) }, // 走 api.tpbl.basketball 官方免費 API
  sbl:              { sportType: 'basketball', displayName: 'SBL 超籃', apiHost: API_HOSTS.basketball, leagueId: 267, season: '2025-2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true }) },

  // 東亞
  cba:              { sportType: 'basketball', displayName: 'CBA 中國職籃', apiHost: API_HOSTS.basketball, leagueId: 31, season: '2025-2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true }) },
  'b-league':       { sportType: 'basketball', displayName: 'B.League 日本職籃', apiHost: API_HOSTS.basketball, leagueId: 56, season: '2025-2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true }) },
  kbl:              { sportType: 'basketball', displayName: 'KBL 韓國職籃', apiHost: API_HOSTS.basketball, leagueId: 91, season: '2025-2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true }) },
  easl:             { sportType: 'basketball', displayName: '東亞超級聯賽', apiHost: API_HOSTS.basketball, leagueId: 386, season: '2025',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true }) },

  // 東南亞 / 大洋洲
  vba:              { sportType: 'basketball', displayName: 'VBA 越南職籃', apiHost: API_HOSTS.basketball, leagueId: 276, season: '2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true, odds: true }) },
  'indonesia-nbl':  { sportType: 'basketball', displayName: 'NBL 印尼職籃', apiHost: API_HOSTS.basketball, leagueId: 139, season: '2025-2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true, odds: true }) },
  'australia-nbl':  { sportType: 'basketball', displayName: 'NBL 澳洲職籃', apiHost: API_HOSTS.basketball, leagueId: 1, season: '2025-2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true }) },
  // PBA：API-Sports 只有排行+賽程+結果；球員/box score 可由 Genius FIBA LiveStats（pba-official）補（需做賽程→FIBA matchId 映射，落地 DB）
  pba:              { sportType: 'basketball', displayName: 'PBA 菲律賓職籃', apiHost: API_HOSTS.basketball, leagueId: 151, season: '2025-2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true }) },

  // 泛歐 / 歐洲各國（pan-EU 賽事季別為單一年份）
  euroleague:       { sportType: 'basketball', displayName: 'Euroleague', apiHost: API_HOSTS.basketball, leagueId: 120, season: '2025',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true }) },
  eurocup:          { sportType: 'basketball', displayName: 'EuroCup', apiHost: API_HOSTS.basketball, leagueId: 194, season: '2025',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true }) },
  'aba-league':     { sportType: 'basketball', displayName: 'ABA 亞得里亞海聯賽', apiHost: API_HOSTS.basketball, leagueId: 198, season: '2025',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true, odds: true }) },
  'spain-acb':      { sportType: 'basketball', displayName: 'ACB 西班牙籃球', apiHost: API_HOSTS.basketball, leagueId: 117, season: '2025-2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true, odds: true }) },
  'france-lnb':     { sportType: 'basketball', displayName: 'LNB 法國籃球', apiHost: API_HOSTS.basketball, leagueId: 2, season: '2025-2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true, odds: true }) },
  'italy-lega-a':   { sportType: 'basketball', displayName: 'Lega A 義大利籃球', apiHost: API_HOSTS.basketball, leagueId: 52, season: '2025-2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true, odds: true }) },
  'germany-bbl':    { sportType: 'basketball', displayName: 'BBL 德國籃球', apiHost: API_HOSTS.basketball, leagueId: 40, season: '2025-2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true, odds: true }) },
  'greece-basket-league': { sportType: 'basketball', displayName: '希臘籃球聯賽', apiHost: API_HOSTS.basketball, leagueId: 45, season: '2025-2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true, odds: true }) },
  'turkey-super-ligi': { sportType: 'basketball', displayName: '土耳其籃球超級聯賽', apiHost: API_HOSTS.basketball, leagueId: 104, season: '2025-2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true, odds: true }) },
  'lithuania-lkl':  { sportType: 'basketball', displayName: 'LKL 立陶宛籃球', apiHost: API_HOSTS.basketball, leagueId: 60, season: '2025-2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true, odds: true }) },
  'poland-tbl':     { sportType: 'basketball', displayName: '波蘭籃球聯賽', apiHost: API_HOSTS.basketball, leagueId: 72, season: '2025-2026',
                      dataSource: 'apisports', capabilities: caps({ standings: true, schedule: true, boxScore: true, players: true, odds: true }) },

  // 足球
  epl:              { sportType: 'football', displayName: '英超',  apiHost: API_HOSTS.football, leagueId: 39,  season: 2025 },
  'la-liga':        { sportType: 'football', displayName: '西甲',  apiHost: API_HOSTS.football, leagueId: 140, season: 2025 },
  'serie-a':        { sportType: 'football', displayName: '義甲',  apiHost: API_HOSTS.football, leagueId: 135, season: 2025 },
  bundesliga:       { sportType: 'football', displayName: '德甲',  apiHost: API_HOSTS.football, leagueId: 78,  season: 2025 },
  'ligue-1':        { sportType: 'football', displayName: '法甲',  apiHost: API_HOSTS.football, leagueId: 61,  season: 2025 },
  ucl:              { sportType: 'football', displayName: '歐冠',  apiHost: API_HOSTS.football, leagueId: 2,   season: 2025 },
  'j-league':       { sportType: 'football', displayName: 'J 聯賽', apiHost: API_HOSTS.football, leagueId: 98,  season: 2025 },
  csl:              { sportType: 'football', displayName: '中超',  apiHost: API_HOSTS.football, leagueId: 169, season: 2025 },
  'world-cup':      { sportType: 'football', displayName: '世界盃', apiHost: API_HOSTS.football, leagueId: 1,   season: 2026 },
  friendlies:       { sportType: 'football', displayName: '國際友誼賽', apiHost: API_HOSTS.football, leagueId: 10, season: 2026 },

  // 棒球（league ID 來自 v1.baseball.api-sports.io/leagues）
  mlb:              { sportType: 'baseball', displayName: 'MLB',      apiHost: API_HOSTS.baseball, leagueId: 1,  season: 2026 },
  cpbl:             { sportType: 'baseball', displayName: '中華職棒',  apiHost: API_HOSTS.baseball, leagueId: 29, season: 2026 },
  npb:              { sportType: 'baseball', displayName: '日本職棒',  apiHost: API_HOSTS.baseball, leagueId: 2,  season: 2026 },
  kbo:              { sportType: 'baseball', displayName: '韓國職棒',  apiHost: API_HOSTS.baseball, leagueId: 5,  season: 2026 },
  'other-baseball': { sportType: 'baseball', displayName: '墨西哥職棒',  apiHost: API_HOSTS.baseball, leagueId: 21, season: 2026 },
};

export const VALID_BOARD_SLUGS = Object.keys(LEAGUE_CONFIG);

/** Redis 快取 TTL（秒）
 *
 * ⚠️ LIVE 為何拉到 600s（10 分鐘）：
 * API-Sports basketball v1 / football v3 免費方案僅 100 req/day。
 * 60s TTL 理論最壞 1440 次/天，10 分鐘 144 次仍會超標但已大幅降低風險。
 * 升級 Pro 後建議在 admin 後台 SportsConfig 把 NBA 的 cacheTtl.live 改回 60。
 */
export const CACHE_TTL = {
  LIVE: 600,       // 即時比分：10 分鐘（免費方案配額保護）
  SCHEDULE: 300,   // 賽程：5 分鐘
  STANDINGS: 600,  // 排名：10 分鐘
  PLAYERS: 3600,   // 球員數據：1 小時
  ODDS: 120,       // 賠率：2 分鐘
} as const;
