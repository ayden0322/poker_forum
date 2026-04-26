/** 支援的非 MLB 棒球聯賽 slug */
export const BASEBALL_LEAGUES = ['cpbl', 'npb', 'kbo'] as const;
export type BaseballLeague = (typeof BASEBALL_LEAGUES)[number];

/** 聯賽時區對應（用於台灣時間轉換） */
export const LEAGUE_TIMEZONE: Record<BaseballLeague, string> = {
  cpbl: 'Asia/Taipei',   // UTC+8（台灣本土，零時差）
  npb: 'Asia/Tokyo',     // UTC+9
  kbo: 'Asia/Seoul',     // UTC+9
};

/** 聯賽中文名稱 */
export const LEAGUE_DISPLAY_NAME: Record<BaseballLeague, string> = {
  cpbl: '中華職棒',
  npb: '日本職棒',
  kbo: '韓國職棒',
};

/** API-Sports 棒球回傳的比賽資料格式（簡化型別） */
export interface ApiSportsBaseballGame {
  id: number;
  date: string;
  time: string;
  timestamp: number;
  timezone: string;
  status: {
    long: string;
    short: string;
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string;
    season: number;
  };
  country: {
    id: number;
    name: string;
    code: string;
    flag: string;
  };
  teams: {
    home: ApiSportsTeam;
    away: ApiSportsTeam;
  };
  scores: {
    home: ApiSportsScore;
    away: ApiSportsScore;
  };
}

export interface ApiSportsTeam {
  id: number;
  name: string;
  logo: string;
}

export interface ApiSportsScore {
  hits: number | null;
  errors: number | null;
  innings: Record<string, number | null>;
  total: number | null;
}

/** 正規化後的比賽資料（前端統一使用） */
export interface NormalizedGame {
  id: number;
  league: BaseballLeague;
  date: string;
  timestamp: number;
  status: string;
  statusShort: string;
  teams: {
    home: {
      id: number;
      name: string;
      nameZhTw?: string | null;
      shortName?: string | null;
      logo: string;
      score: number | null;
    };
    away: {
      id: number;
      name: string;
      nameZhTw?: string | null;
      shortName?: string | null;
      logo: string;
      score: number | null;
    };
  };
  scores?: {
    home: ApiSportsScore;
    away: ApiSportsScore;
  };
}
