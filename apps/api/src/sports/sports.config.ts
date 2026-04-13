/** API-Sports 各運動的 base host */
export const API_HOSTS = {
  football: 'v3.football.api-sports.io',
  basketball: 'v1.basketball.api-sports.io',
  baseball: 'v1.baseball.api-sports.io',
} as const;

export type SportType = 'football' | 'basketball' | 'baseball';

interface LeagueConfig {
  sportType: SportType;
  displayName: string;
  apiHost: string;
  leagueId: number;
  season: string | number;
}

/** Board slug → 聯賽設定對應（程式碼預設值，可被 DB SportsConfig 覆蓋） */
export const LEAGUE_CONFIG: Record<string, LeagueConfig> = {
  // 籃球（league ID 來自 v1.basketball.api-sports.io/leagues）
  nba:              { sportType: 'basketball', displayName: 'NBA',      apiHost: API_HOSTS.basketball, leagueId: 12,  season: '2025-2026' },
  cba:              { sportType: 'basketball', displayName: 'CBA',      apiHost: API_HOSTS.basketball, leagueId: 31,  season: '2025-2026' },
  't1-league':      { sportType: 'basketball', displayName: 'T1 聯盟',  apiHost: API_HOSTS.basketball, leagueId: 402, season: '2025-2026' },
  tpbl:             { sportType: 'basketball', displayName: 'TPBL',     apiHost: API_HOSTS.basketball, leagueId: 427, season: '2025-2026' },
  'b-league':       { sportType: 'basketball', displayName: 'B.League', apiHost: API_HOSTS.basketball, leagueId: 56,  season: '2025-2026' },
  kbl:              { sportType: 'basketball', displayName: 'KBL',      apiHost: API_HOSTS.basketball, leagueId: 91,  season: '2025-2026' },
  euroleague:       { sportType: 'basketball', displayName: '歐洲籃球',  apiHost: API_HOSTS.basketball, leagueId: 120, season: '2025-2026' },

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

  // 棒球（league ID 來自 v1.baseball.api-sports.io/leagues）
  mlb:              { sportType: 'baseball', displayName: 'MLB',      apiHost: API_HOSTS.baseball, leagueId: 1,  season: 2026 },
  cpbl:             { sportType: 'baseball', displayName: '中華職棒',  apiHost: API_HOSTS.baseball, leagueId: 29, season: 2026 },
  npb:              { sportType: 'baseball', displayName: '日本職棒',  apiHost: API_HOSTS.baseball, leagueId: 2,  season: 2026 },
  kbo:              { sportType: 'baseball', displayName: '韓國職棒',  apiHost: API_HOSTS.baseball, leagueId: 5,  season: 2026 },
};

export const VALID_BOARD_SLUGS = Object.keys(LEAGUE_CONFIG);

/** Redis 快取 TTL（秒） */
export const CACHE_TTL = {
  LIVE: 60,        // 即時比分：60 秒
  SCHEDULE: 300,   // 賽程：5 分鐘
  STANDINGS: 600,  // 排名：10 分鐘
  PLAYERS: 3600,   // 球員數據：1 小時
  ODDS: 120,       // 賠率：2 分鐘
} as const;
