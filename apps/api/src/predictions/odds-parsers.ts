// P幣競猜 — API-Sports odds 回應解析（純函式，單元測試在 odds-parsers.spec.ts）
// ⚠️ /odds?league 回的是「視窗內全部有盤場次」含已完賽（規格 §2.4 實測），呼叫端要過濾未開賽。

import { PredictionMarket } from '@betting-forum/database';

/** 解析後的一筆報價（對應 OddsQuote 一列） */
export interface ParsedQuote {
  market: PredictionMarket;
  selection: 'HOME' | 'DRAW' | 'AWAY' | 'OVER' | 'UNDER';
  line: number | null;
  odds: number;
}

/** 解析後的一場賽事（football 的 teams 需另從 /fixtures 同步，這裡可為 null） */
export interface ParsedMatchOdds {
  apiFixtureId: number;
  startTime: Date;
  apiStatus: string | null;
  homeName: string | null;
  awayName: string | null;
  quotes: ParsedQuote[];
}

/** API-Sports 玩法名稱 → 內部 market 映射（名稱以外的盤一律忽略） */
const FOOTBALL_BET_MAP: Record<string, PredictionMarket> = {
  'Match Winner': 'WINLOSE', // 足球勝負 = 1X2（含和局，selection=DRAW）
  'Goals Over/Under': 'OVER_UNDER',
};
const BASEBALL_BET_MAP: Record<string, PredictionMarket> = {
  'Home/Away': 'WINLOSE', // 棒球勝負 = 二選一錢線
  'Over/Under': 'OVER_UNDER', // WH 對 MLB 沒開此線；config markets 沒開就不會入庫
};

/** 'Home' / 'Draw' / 'Away' / 'Over 2.5' / 'Under 8.5' → selection + line */
function parseValue(value: string): { selection: ParsedQuote['selection']; line: number | null } | null {
  const v = value.trim();
  if (v === 'Home') return { selection: 'HOME', line: null };
  if (v === 'Draw') return { selection: 'DRAW', line: null };
  if (v === 'Away') return { selection: 'AWAY', line: null };
  const ou = v.match(/^(Over|Under)\s+(\d+(?:\.\d+)?)$/);
  if (ou) {
    return { selection: ou[1] === 'Over' ? 'OVER' : 'UNDER', line: Number(ou[2]) };
  }
  return null; // 其他型態（Odd/Even、隊名讓分…）不在二期玩法內
}

function parseBets(
  bets: Array<{ name: string; values: Array<{ value: string; odd: string }> }>,
  betMap: Record<string, PredictionMarket>,
  allowedMarkets: PredictionMarket[],
): ParsedQuote[] {
  const quotes: ParsedQuote[] = [];
  for (const bet of bets ?? []) {
    const market = betMap[bet.name];
    if (!market || !allowedMarkets.includes(market)) continue;
    for (const val of bet.values ?? []) {
      const parsed = parseValue(val.value);
      if (!parsed) continue;
      const odds = Number(val.odd);
      if (!Number.isFinite(odds) || odds <= 1) continue; // 賠率 ≤1 = 髒資料，不入庫
      quotes.push({ market, ...parsed, odds });
    }
  }
  return quotes;
}

/** football /odds 回應 item → ParsedMatchOdds（teams 不在 odds 回應裡，回 null 由 /fixtures 補） */
export function parseFootballOddsItem(
  item: {
    fixture: { id: number; date: string };
    bookmakers?: Array<{ id: number; bets: Array<{ name: string; values: Array<{ value: string; odd: string }> }> }>;
  },
  bookmakerId: number,
  allowedMarkets: PredictionMarket[],
): ParsedMatchOdds {
  const bm = (item.bookmakers ?? []).find((b) => b.id === bookmakerId);
  return {
    apiFixtureId: item.fixture.id,
    startTime: new Date(item.fixture.date),
    apiStatus: null, // football odds 回應無 status，收單/過濾靠 /fixtures 同步的 DB 值
    homeName: null,
    awayName: null,
    quotes: bm ? parseBets(bm.bets, FOOTBALL_BET_MAP, allowedMarkets) : [],
  };
}

/** baseball /odds 回應 item → ParsedMatchOdds（game 物件自帶 teams/status，可直接 upsert 賽事） */
export function parseBaseballOddsItem(
  item: {
    game: {
      id: number;
      date: string;
      status: { short: string };
      teams: { home: { name: string }; away: { name: string } };
    };
    bookmakers?: Array<{ id: number; bets: Array<{ name: string; values: Array<{ value: string; odd: string }> }> }>;
  },
  bookmakerId: number,
  allowedMarkets: PredictionMarket[],
): ParsedMatchOdds {
  const bm = (item.bookmakers ?? []).find((b) => b.id === bookmakerId);
  return {
    apiFixtureId: item.game.id,
    startTime: new Date(item.game.date),
    apiStatus: item.game.status?.short ?? null,
    homeName: item.game.teams?.home?.name ?? null,
    awayName: item.game.teams?.away?.name ?? null,
    quotes: bm ? parseBets(bm.bets, BASEBALL_BET_MAP, allowedMarkets) : [],
  };
}

/** football /fixtures 回應 item → 賽事同步欄位 */
export function parseFootballFixture(item: {
  fixture: { id: number; date: string; status: { short: string } };
  teams: { home: { name: string }; away: { name: string } };
}): { apiFixtureId: number; startTime: Date; apiStatus: string; homeName: string; awayName: string } {
  return {
    apiFixtureId: item.fixture.id,
    startTime: new Date(item.fixture.date),
    apiStatus: item.fixture.status.short,
    homeName: item.teams.home.name,
    awayName: item.teams.away.name,
  };
}
