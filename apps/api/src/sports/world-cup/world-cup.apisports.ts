/**
 * FIFA 世界盃 2026 — API-Sports（v3.football.api-sports.io, league=1）共用層
 *
 * 同時被 world-cup.cron.ts（定時同步）與 world-cup.service.ts（admin 手動同步）使用。
 *
 * 背景：World Cup 的 model 因 2026-05-18 migration drift 把 apiTeamId / apiFixtureId
 * 欄位註解掉了，所以這裡**只能用隊名配對**把比分回寫，不依賴 API id。
 * 同步只更新「比分 / 分鐘 / 狀態」，不碰賽程結構（隊伍、開賽時間、場館一律不動）。
 */

export const WC_FOOTBALL_HOST = 'v3.football.api-sports.io';
export const WC_LEAGUE_ID = 1;
export const WC_SEASON = 2026;

/**
 * API-Sports 隊名 ↔ DB nameEn 別名（2026-06 實測 league=1/season=2026 差異）。
 * 其餘 45 隊與 DB nameEn 完全一致，只有這 3 隊兩套 seed 命名不同：
 *   - 本機（openfootball seed）：Turkey / Cape Verde / DR Congo
 *   - 正式站（apisports seed）：可能存 API 原名 Türkiye / Cape Verde Islands / Congo DR
 * 為相容兩種 seed，配對時「先試 API 原名、再試別名」雙向容錯（見 resolve）。
 */
const NAME_ALIAS: Record<string, string> = {
  'Cape Verde Islands': 'Cape Verde',
  'Congo DR': 'DR Congo',
  Türkiye: 'Turkey',
};

export interface ApiTeam {
  id: number;
  name: string;
  logo: string;
}

export interface ApiFixture {
  fixture: {
    id: number;
    date: string; // ISO UTC
    status: { short: string; elapsed: number | null };
  };
  league: { round: string };
  teams: { home: ApiTeam; away: ApiTeam };
  goals: { home: number | null; away: number | null };
}

function namesMatch(dbName: string, apiName: string): boolean {
  return dbName === apiName || NAME_ALIAS[apiName] === dbName;
}

/** 在 API fixtures 中用隊名找出對應的 fixtureId（小組賽，雙向容錯配對） */
export function findFixtureId(
  fixtures: ApiFixture[],
  homeNameEn: string,
  awayNameEn: string,
): number | null {
  for (const f of fixtures) {
    if (!/Group Stage/i.test(f.league.round)) continue;
    if (namesMatch(homeNameEn, f.teams.home.name) && namesMatch(awayNameEn, f.teams.away.name)) {
      return f.fixture.id;
    }
  }
  return null;
}

// ===== 賽事細節（進球/事件、數據、陣容）=====
export interface ApiEvent {
  time: { elapsed: number | null; extra: number | null };
  team: { name: string };
  player: { name: string | null };
  assist: { name: string | null };
  type: string; // Goal | Card | subst | Var
  detail: string;
}
export interface ApiStatTeam {
  team: { name: string };
  statistics: { type: string; value: string | number | null }[];
}
export interface ApiLineupTeam {
  team: { name: string };
  formation: string | null;
  coach: { name: string | null };
  startXI: { player: { name: string; number: number | null; pos: string | null } }[];
  substitutes: { player: { name: string; number: number | null; pos: string | null } }[];
}

export interface MatchDetails {
  available: boolean;
  events: {
    minute: number;
    extra: number | null;
    side: 'home' | 'away' | null;
    type: string;
    detail: string;
    player: string | null;
    assist: string | null;
  }[];
  statistics: { type: string; home: string | number | null; away: string | number | null }[];
  lineups: {
    home: LineupSide | null;
    away: LineupSide | null;
  };
}
interface LineupSide {
  formation: string | null;
  coach: string | null;
  startXI: { name: string; number: number | null; pos: string | null }[];
  substitutes: { name: string; number: number | null; pos: string | null }[];
}

const EMPTY_DETAILS: MatchDetails = {
  available: false,
  events: [],
  statistics: [],
  lineups: { home: null, away: null },
};

/** 把 API-Sports 三組原始資料正規化成前端友善、依 home/away 配對的結構 */
export function normalizeDetails(
  homeNameEn: string,
  events: ApiEvent[],
  stats: ApiStatTeam[],
  lineups: ApiLineupTeam[],
): MatchDetails {
  const sideOf = (apiName: string): 'home' | 'away' | null =>
    namesMatch(homeNameEn, apiName) ? 'home' : 'away';

  const normEvents = (events ?? [])
    .map((e) => ({
      minute: e.time?.elapsed ?? 0,
      extra: e.time?.extra ?? null,
      side: e.team?.name ? sideOf(e.team.name) : null,
      type: e.type,
      detail: e.detail,
      player: e.player?.name ?? null,
      assist: e.assist?.name ?? null,
    }))
    .sort((a, b) => a.minute - b.minute || (a.extra ?? 0) - (b.extra ?? 0));

  // 數據依 type 把 home/away 配成一列
  const homeStat = (stats ?? []).find((s) => namesMatch(homeNameEn, s.team.name));
  const awayStat = (stats ?? []).find((s) => !namesMatch(homeNameEn, s.team.name));
  const types = Array.from(
    new Set([
      ...(homeStat?.statistics.map((s) => s.type) ?? []),
      ...(awayStat?.statistics.map((s) => s.type) ?? []),
    ]),
  );
  const statistics = types.map((type) => ({
    type,
    home: homeStat?.statistics.find((s) => s.type === type)?.value ?? null,
    away: awayStat?.statistics.find((s) => s.type === type)?.value ?? null,
  }));

  const toSide = (l: ApiLineupTeam | undefined): LineupSide | null =>
    l
      ? {
          formation: l.formation,
          coach: l.coach?.name ?? null,
          startXI: (l.startXI ?? []).map((p) => ({
            name: p.player.name,
            number: p.player.number,
            pos: p.player.pos,
          })),
          substitutes: (l.substitutes ?? []).map((p) => ({
            name: p.player.name,
            number: p.player.number,
            pos: p.player.pos,
          })),
        }
      : null;
  const homeLineup = (lineups ?? []).find((l) => namesMatch(homeNameEn, l.team.name));
  const awayLineup = (lineups ?? []).find((l) => !namesMatch(homeNameEn, l.team.name));

  return {
    available: normEvents.length > 0 || statistics.length > 0 || !!homeLineup,
    events: normEvents,
    statistics,
    lineups: { home: toSide(homeLineup), away: toSide(awayLineup) },
  };
}

export { EMPTY_DETAILS };

/** api-sports status short code → 內部三態 */
export function wcStatusFromApi(short: string): 'scheduled' | 'live' | 'finished' {
  if (['FT', 'AET', 'PEN', 'AWD', 'WO'].includes(short)) return 'finished';
  if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(short)) return 'live';
  return 'scheduled';
}

/** 呼叫 API-Sports football endpoint */
export async function callFootballApi<T>(
  apiKey: string,
  endpoint: string,
  params: Record<string, string | number>,
): Promise<T> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  const url = `https://${WC_FOOTBALL_HOST}${endpoint}?${q.toString()}`;
  const res = await fetch(url, { headers: { 'x-apisports-key': apiKey } });
  if (!res.ok) {
    throw new Error(`API-Sports ${endpoint} 失敗: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { response: T; errors: unknown };
  // ⚠️ api-sports 用 HTTP 200 + errors 欄位回報額度爆掉/權杖錯誤（成功時 errors 為空陣列 []）。
  //    不檢查的話，「當日額度用罄」會被當成空資料靜默吞掉，只能用肉眼發現——這裡讓它明確 throw。
  const errs = data.errors;
  const hasErr = Array.isArray(errs)
    ? errs.length > 0
    : !!errs && Object.keys(errs as object).length > 0;
  if (hasErr) {
    throw new Error(`API-Sports ${endpoint} 回報錯誤: ${JSON.stringify(errs)}`);
  }
  return data.response;
}

/** Redis 快取 key：單場賽事細節（cron 寫入、service 讀取，集中定義避免兩邊漂移） */
export const wcDetailsCacheKey = (matchNumber: number) => `wc:details:${matchNumber}`;

/** 抓單場 fixture 的 events/statistics/lineups 並正規化（cron 用，結果寫進 Redis） */
export async function fetchFixtureDetails(
  apiKey: string,
  fixtureId: number,
  homeNameEn: string,
): Promise<MatchDetails> {
  const [events, stats, lineups] = await Promise.all([
    callFootballApi<ApiEvent[]>(apiKey, '/fixtures/events', { fixture: fixtureId }),
    callFootballApi<ApiStatTeam[]>(apiKey, '/fixtures/statistics', { fixture: fixtureId }),
    callFootballApi<ApiLineupTeam[]>(apiKey, '/fixtures/lineups', { fixture: fixtureId }),
  ]);
  return normalizeDetails(homeNameEn, events, stats, lineups);
}

/**
 * 把進行中的 API 小組賽 fixtures 對應回 DB 場次（沿用隊名配對），供 cron 抓細節用。
 * 回傳每場的 fixtureId / matchNumber / DB 端 homeNameEn（供 normalizeDetails 配 home/away）。
 */
export async function resolveLiveGroupMatches(
  prisma: any,
  fixtures: ApiFixture[],
): Promise<{ fixtureId: number; matchNumber: number; homeNameEn: string }[]> {
  const teams: { id: number; nameEn: string }[] = await prisma.worldCupTeam.findMany({
    select: { id: true, nameEn: true },
  });
  const idByName = new Map<string, number>();
  for (const t of teams) idByName.set(t.nameEn, t.id);
  const resolve = (apiName: string) =>
    idByName.get(apiName) ?? idByName.get(NAME_ALIAS[apiName] ?? apiName);

  const out: { fixtureId: number; matchNumber: number; homeNameEn: string }[] = [];
  for (const f of fixtures) {
    if (!/Group Stage/i.test(f.league.round)) continue;
    const homeId = resolve(f.teams.home.name);
    const awayId = resolve(f.teams.away.name);
    if (!homeId || !awayId) continue;
    const m = await prisma.worldCupMatch.findFirst({
      where: { stage: 'group', homeTeamId: homeId, awayTeamId: awayId },
      select: { matchNumber: true, homeTeam: { select: { nameEn: true } } },
    });
    if (!m || !m.homeTeam) continue;
    out.push({ fixtureId: f.fixture.id, matchNumber: m.matchNumber, homeNameEn: m.homeTeam.nameEn });
  }
  return out;
}

/**
 * 用隊名配對，把 API 小組賽比分同步進 WorldCupMatch。
 * 只更新比分/分鐘/狀態；只處理小組賽（避免淘汰賽同隊組合誤更新小組賽）。
 */
export async function syncWorldCupScores(prisma: any, fixtures: ApiFixture[]) {
  const teams: { id: number; nameEn: string }[] = await prisma.worldCupTeam.findMany({
    select: { id: true, nameEn: true },
  });
  const idByName = new Map<string, number>();
  for (const t of teams) idByName.set(t.nameEn, t.id);
  // 雙向容錯：先試 API 原名（相容 apisports seed），再試別名（相容 openfootball seed）
  const resolve = (apiName: string) => idByName.get(apiName) ?? idByName.get(NAME_ALIAS[apiName] ?? apiName);

  let updated = 0;
  const unmatched: string[] = [];

  for (const f of fixtures) {
    // 只同步小組賽（API round 形如 "Group Stage - 1"）
    if (!/Group Stage/i.test(f.league.round)) continue;

    const homeId = resolve(f.teams.home.name);
    const awayId = resolve(f.teams.away.name);
    if (!homeId || !awayId) {
      unmatched.push(`${f.teams.home.name} vs ${f.teams.away.name}`);
      continue;
    }

    const r = await prisma.worldCupMatch.updateMany({
      where: { stage: 'group', homeTeamId: homeId, awayTeamId: awayId },
      data: {
        homeScore: f.goals.home,
        awayScore: f.goals.away,
        liveMinute: f.fixture.status.elapsed,
        status: wcStatusFromApi(f.fixture.status.short),
      },
    });
    updated += r.count;
  }

  return { updated, unmatched };
}
