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
  return data.response;
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
