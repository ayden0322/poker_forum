/** 看板 slug → API-Sports 運動類型對應 */
export const SPORT_CONFIG = {
  baseball: {
    name: '棒球',
    apiHost: 'v1.baseball.api-sports.io',
    // MLB league id
    leagueId: 1,
    season: new Date().getFullYear(),
  },
  basketball: {
    name: '籃球',
    apiHost: 'v2.nba.api-sports.io',
    // API-NBA 專屬 NBA API（v2）
    leagueId: 12,
    season: `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`,
  },
  soccer: {
    name: '足球',
    apiHost: 'v3.football.api-sports.io',
    // 英超 league id（可擴充更多聯賽）
    leagueId: 39,
    season: new Date().getFullYear(),
  },
} as const;

export type SportType = keyof typeof SPORT_CONFIG;

export const VALID_SPORT_TYPES = Object.keys(SPORT_CONFIG) as SportType[];

/** Redis 快取 TTL（秒） */
export const CACHE_TTL = {
  LIVE: 60,        // 即時比分：60 秒
  SCHEDULE: 300,   // 賽程：5 分鐘
  STANDINGS: 600,  // 排名：10 分鐘
  PLAYERS: 3600,   // 球員數據：1 小時
  ODDS: 120,       // 賠率：2 分鐘
} as const;
