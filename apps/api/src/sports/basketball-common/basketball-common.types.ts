import { LEAGUE_CONFIG, LeagueCapabilities } from '../sports.config';

/**
 * 通用籃球支援的聯賽 = LEAGUE_CONFIG 中 sportType==='basketball' 且走 API-Sports 的板塊。
 *
 * 動態從 config 推導（不另維護一份清單），新增聯賽只要改 config 即自動納入。
 * 排除：NBA（走 ESPN bespoke 模組）、TPBL（走官方免費 API adapter）。
 */
export function listApiSportsBasketballLeagues(): string[] {
  return Object.entries(LEAGUE_CONFIG)
    .filter(
      ([, cfg]) =>
        cfg.sportType === 'basketball' &&
        (cfg.dataSource === 'apisports' || cfg.dataSource === undefined),
    )
    .map(([slug]) => slug);
}

export function isApiSportsBasketballLeague(slug: string): boolean {
  const cfg = LEAGUE_CONFIG[slug];
  return (
    !!cfg &&
    cfg.sportType === 'basketball' &&
    (cfg.dataSource === 'apisports' || cfg.dataSource === undefined)
  );
}

/**
 * 是否為「通用籃球 controller」可服務的板塊 = 籃球 sportType 且非 NBA（ESPN bespoke 走 /nba 路由）。
 * 包含 TPBL（官方 adapter）與所有 API-Sports 籃球聯賽。
 */
export function isBasketballBoard(slug: string): boolean {
  const cfg = LEAGUE_CONFIG[slug];
  return !!cfg && cfg.sportType === 'basketball' && cfg.dataSource !== 'espn';
}

export function isTpblBoard(slug: string): boolean {
  return LEAGUE_CONFIG[slug]?.dataSource === 'tpbl-official';
}

/** 取得聯賽能力宣告（前端據此決定顯示哪些 widget） */
export function getLeagueCapabilities(slug: string): LeagueCapabilities | null {
  return LEAGUE_CONFIG[slug]?.capabilities ?? null;
}

/** API-Sports 籃球比分（逐節 + 延長 + 總分） */
export interface ApiSportsBasketballScore {
  quarter_1: number | null;
  quarter_2: number | null;
  quarter_3: number | null;
  quarter_4: number | null;
  over_time: number | null;
  total: number | null;
}

export interface ApiSportsBasketballTeam {
  id: number;
  name: string;
  logo: string;
}

/** API-Sports 籃球比賽資料格式（簡化型別） */
export interface ApiSportsBasketballGame {
  id: number;
  date: string;
  time: string;
  timestamp: number;
  timezone: string;
  stage: string | null;
  week: string | null;
  venue: string | null;
  status: {
    long: string;
    short: string;
    timer: string | null;
  };
  league: {
    id: number;
    name: string;
    type: string;
    season: string | number;
    logo: string;
  };
  country: {
    id: number;
    name: string;
    code: string | null;
    flag: string | null;
  };
  teams: {
    home: ApiSportsBasketballTeam;
    away: ApiSportsBasketballTeam;
  };
  scores: {
    home: ApiSportsBasketballScore;
    away: ApiSportsBasketballScore;
  };
}

/** 正規化後的比賽資料（前端統一使用，跨聯賽一致） */
export interface NormalizedBasketballGame {
  id: number;
  league: string;
  date: string;
  timestamp: number;
  status: string;
  statusShort: string;
  stage: string | null;
  venue: string | null;
  teams: {
    home: NormalizedBasketballTeam;
    away: NormalizedBasketballTeam;
  };
  scores?: {
    home: ApiSportsBasketballScore;
    away: ApiSportsBasketballScore;
  };
}

export interface NormalizedBasketballTeam {
  id: number;
  name: string;
  nameZhTw?: string | null;
  shortName?: string | null;
  logo: string;
  score: number | null;
}

/** 正規化球員單場數據（box score 一行）— 跨資料源統一 */
export interface BoxScorePlayerLine {
  teamId: number;
  name: string;
  starter: boolean;
  minutes: string | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  fgm: number | null;
  fga: number | null;
  tpm: number | null;
  tpa: number | null;
  ftm: number | null;
  fta: number | null;
}

/** 正規化球隊單場統計 */
export interface BoxScoreTeamLine {
  teamId: number;
  points: number | null;
  fgm: number | null;
  fga: number | null;
  tpm: number | null;
  tpa: number | null;
  ftm: number | null;
  fta: number | null;
  rebounds: number | null;
  offReb: number | null;
  defReb: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fouls: number | null;
}

/** 正規化 box score（前端依 teamId 對應主/客）*/
export interface NormalizedBoxScore {
  teams: BoxScoreTeamLine[];
  players: BoxScorePlayerLine[];
}

/** 正規化賠率（取單一博彩商的主要市場，前端友善）*/
export interface OddsMarket {
  name: string;
  values: { label: string; odd: string }[];
}
export interface NormalizedOdds {
  bookmaker: string | null;
  updateAt?: string | null;
  markets: OddsMarket[];
}

/**
 * 正規化排行榜（跨資料源統一）：API-Sports 與 TPBL 官方 API 都映射成此形狀，
 * 前端同一個 StandingsWidget 即可通吃。
 */
export interface NormalizedStanding {
  rank: number;
  team: {
    id: number;
    name: string;
    nameZhTw?: string | null;
    shortName?: string | null;
    logo: string;
  };
  played: number | null;
  wins: number;
  losses: number;
  winPct: number | null;
  gamesBehind: number | null;
  streak: string | null;
  pointsFor?: number | null;
  pointsAgainst?: number | null;
  group?: string | null;
}
