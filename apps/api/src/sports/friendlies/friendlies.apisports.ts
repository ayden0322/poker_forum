/**
 * 國際友誼賽 — API-Sports（v3.football.api-sports.io, league=10）共用層
 *
 * 同時被 friendlies.cron.ts（LIVE 刷新）與 scripts/seed-friendlies-from-apisports.ts（整季 seed）使用，
 * 焦點戰（isFeatured）判斷邏輯只在這裡定義一處，避免兩邊漂移。
 */

export const FOOTBALL_HOST = 'v3.football.api-sports.io';
export const FRIENDLIES_LEAGUE_ID = 10;
export const FRIENDLIES_SEASON = 2026;

/**
 * 焦點國家隊白名單（FIFA 排名前段 + 高關注度球隊）。
 * 用途：兩隊皆在名單內 → 該場標 isFeatured=true → 生成可索引頁面。
 * 其餘冷門友誼賽只進 DB、頁面 noindex，避免薄頁面反傷整站 SEO。
 */
export const MARQUEE_TEAMS = new Set<string>([
  'Argentina', 'France', 'Spain', 'England', 'Brazil', 'Portugal', 'Netherlands',
  'Belgium', 'Italy', 'Germany', 'Croatia', 'Morocco', 'Colombia', 'Uruguay',
  'USA', 'Mexico', 'Switzerland', 'Denmark', 'Japan', 'South Korea', 'Senegal',
  'Iran', 'Serbia', 'Ukraine', 'Austria', 'Sweden', 'Poland', 'Wales', 'Norway',
  'Ecuador', 'Nigeria', 'Egypt', 'Australia', 'Canada', 'Scotland', 'Turkey',
  'Czech Republic', 'Hungary', 'Greece', 'Ivory Coast', 'Chile', 'Peru', 'Saudi Arabia',
]);

export interface ApiTeam {
  id: number;
  name: string;
  logo: string;
}

export interface ApiFixture {
  fixture: {
    id: number;
    date: string; // ISO UTC
    venue: { name: string | null; city: string | null };
    status: { short: string; elapsed: number | null };
  };
  league: { round: string };
  teams: { home: ApiTeam; away: ApiTeam };
  goals: { home: number | null; away: number | null };
}

/** api-sports status short code → 內部三態 */
export function statusFromApi(short: string): 'scheduled' | 'live' | 'finished' {
  if (['FT', 'AET', 'PEN', 'AWD', 'WO'].includes(short)) return 'finished';
  if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(short)) return 'live';
  return 'scheduled';
}

export function isMarquee(teamName: string): boolean {
  return MARQUEE_TEAMS.has(teamName);
}

/** 呼叫 API-Sports football endpoint */
export async function callFootballApi<T>(
  apiKey: string,
  endpoint: string,
  params: Record<string, string | number>,
): Promise<T> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  const url = `https://${FOOTBALL_HOST}${endpoint}?${q.toString()}`;
  const res = await fetch(url, { headers: { 'x-apisports-key': apiKey } });
  if (!res.ok) {
    throw new Error(`API-Sports ${endpoint} 失敗: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { response: T; errors: unknown };
  return data.response;
}

/**
 * 將一批 api-sports fixtures upsert 進 DB（teams + matches）。
 * 接受任何 PrismaClient 相容物件（PrismaService 或獨立 PrismaClient）。
 * 回傳 { matches, teams } 處理筆數。
 */
export async function upsertFixtures(prisma: any, fixtures: ApiFixture[]) {
  let teamCount = 0;
  let matchCount = 0;

  for (const fx of fixtures) {
    const { home, away } = fx.teams;
    const homeTeam = await upsertTeam(prisma, home);
    const awayTeam = await upsertTeam(prisma, away);
    teamCount += 2;

    const status = statusFromApi(fx.fixture.status.short);
    const featured = isMarquee(home.name) && isMarquee(away.name);

    await prisma.friendlyMatch.upsert({
      where: { apiFixtureId: fx.fixture.id },
      create: {
        apiFixtureId: fx.fixture.id,
        season: FRIENDLIES_SEASON,
        round: fx.league.round,
        kickoffAt: new Date(fx.fixture.date),
        venue: fx.fixture.venue.name,
        venueCity: fx.fixture.venue.city,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeScore: fx.goals.home,
        awayScore: fx.goals.away,
        status,
        statusShort: fx.fixture.status.short,
        liveMinute: fx.fixture.status.elapsed,
        isFeatured: featured,
      },
      update: {
        kickoffAt: new Date(fx.fixture.date),
        venue: fx.fixture.venue.name,
        venueCity: fx.fixture.venue.city,
        homeScore: fx.goals.home,
        awayScore: fx.goals.away,
        status,
        statusShort: fx.fixture.status.short,
        liveMinute: fx.fixture.status.elapsed,
        isFeatured: featured,
      },
    });
    matchCount++;
  }

  return { matches: matchCount, teams: teamCount };
}

async function upsertTeam(prisma: any, t: ApiTeam) {
  return prisma.friendlyTeam.upsert({
    where: { apiTeamId: t.id },
    create: {
      apiTeamId: t.id,
      nameEn: t.name,
      country: t.name,
      logoUrl: t.logo,
      isMarquee: isMarquee(t.name),
    },
    update: {
      logoUrl: t.logo,
      isMarquee: isMarquee(t.name),
    },
  });
}
