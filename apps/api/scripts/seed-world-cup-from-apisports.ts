/**
 * FIFA 世界盃 2026 — API-Sports 為主資料源 seed
 *
 * 資料來源：
 *   - api-sports（v3.football.api-sports.io，league=1, season=2026）：48 隊 + 12 組積分結構 + 72 場小組賽（含 apiTeamId / apiFixtureId / logoUrl）
 *   - openfootball/worldcup.json：補淘汰賽 32 場 placeholder（api-sports 還沒抽籤）
 *
 * 用法：
 *   pnpm exec tsx apps/api/scripts/seed-world-cup-from-apisports.ts
 *
 * matchNumber 分配：
 *   1-72：小組賽，按 kickoffAt ASC 排序（api-sports）
 *   73-104：淘汰賽 placeholder（openfootball 順序）
 *
 * 注意：此 script 取代舊版 seed-world-cup-2026.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient } from '@betting-forum/database';

const prisma = new PrismaClient();

const API_KEY = process.env.API_SPORTS_KEY ?? '';
if (!API_KEY) throw new Error('API_SPORTS_KEY 未設定');

const FOOTBALL_HOST = 'v3.football.api-sports.io';
const LEAGUE_ID = 1;
const SEASON = 2026;

const OPENFOOTBALL_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

// ============================================
// FIFA Code 對照（api-sports 隊名 → FIFA Code）
// ============================================
const API_NAME_TO_FIFA: Record<string, string> = {
  Mexico: 'MEX', Canada: 'CAN', USA: 'USA',
  Argentina: 'ARG', Brazil: 'BRA', Uruguay: 'URU', Colombia: 'COL',
  Ecuador: 'ECU', Paraguay: 'PAR',
  England: 'ENG', France: 'FRA', Spain: 'ESP', Germany: 'GER',
  Portugal: 'POR', Netherlands: 'NED', Belgium: 'BEL',
  Croatia: 'CRO', Switzerland: 'SUI', Austria: 'AUT',
  Norway: 'NOR', Scotland: 'SCO',
  'Czech Republic': 'CZE', Türkiye: 'TUR',
  Japan: 'JPN', 'South Korea': 'KOR', Australia: 'AUS', Iran: 'IRN',
  'Saudi Arabia': 'KSA', Qatar: 'QAT', Uzbekistan: 'UZB', Jordan: 'JOR',
  Iraq: 'IRQ',
  Morocco: 'MAR', Senegal: 'SEN', Tunisia: 'TUN', Algeria: 'ALG',
  Egypt: 'EGY', Ghana: 'GHA', 'Ivory Coast': 'CIV',
  'Congo DR': 'COD', 'South Africa': 'RSA', 'Cape Verde Islands': 'CPV',
  'New Zealand': 'NZL', Panama: 'PAN', Haiti: 'HAI',
  Curaçao: 'CUW',
  'Bosnia & Herzegovina': 'BIH', Sweden: 'SWE',
};

// FIFA Code → 中文（沿用舊 seed）
const COUNTRY_ZH: Record<string, string> = {
  MEX: '墨西哥', CAN: '加拿大', USA: '美國',
  ARG: '阿根廷', BRA: '巴西', URU: '烏拉圭', COL: '哥倫比亞',
  ECU: '厄瓜多', PAR: '巴拉圭',
  ENG: '英格蘭', FRA: '法國', ESP: '西班牙', GER: '德國',
  POR: '葡萄牙', NED: '荷蘭', BEL: '比利時',
  CRO: '克羅埃西亞', SUI: '瑞士', AUT: '奧地利',
  NOR: '挪威', SCO: '蘇格蘭',
  CZE: '捷克', TUR: '土耳其',
  JPN: '日本', KOR: '南韓', AUS: '澳洲', IRN: '伊朗',
  KSA: '沙烏地阿拉伯', QAT: '卡達', UZB: '烏茲別克', JOR: '約旦',
  IRQ: '伊拉克',
  MAR: '摩洛哥', SEN: '塞內加爾', TUN: '突尼西亞', ALG: '阿爾及利亞',
  EGY: '埃及', GHA: '迦納', CIV: '象牙海岸',
  COD: '剛果民主共和國', RSA: '南非', CPV: '維德角',
  NZL: '紐西蘭', PAN: '巴拿馬', HAI: '海地',
  CUW: '庫拉索',
  BIH: '波士尼亞與赫塞哥維納', SWE: '瑞典',
};

// 國旗 emoji 對照（FIFA Code → emoji）
const FLAG_EMOJI: Record<string, string> = {
  MEX: '🇲🇽', CAN: '🇨🇦', USA: '🇺🇸',
  ARG: '🇦🇷', BRA: '🇧🇷', URU: '🇺🇾', COL: '🇨🇴',
  ECU: '🇪🇨', PAR: '🇵🇾',
  ENG: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', FRA: '🇫🇷', ESP: '🇪🇸', GER: '🇩🇪',
  POR: '🇵🇹', NED: '🇳🇱', BEL: '🇧🇪',
  CRO: '🇭🇷', SUI: '🇨🇭', AUT: '🇦🇹',
  NOR: '🇳🇴', SCO: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  CZE: '🇨🇿', TUR: '🇹🇷',
  JPN: '🇯🇵', KOR: '🇰🇷', AUS: '🇦🇺', IRN: '🇮🇷',
  KSA: '🇸🇦', QAT: '🇶🇦', UZB: '🇺🇿', JOR: '🇯🇴',
  IRQ: '🇮🇶',
  MAR: '🇲🇦', SEN: '🇸🇳', TUN: '🇹🇳', ALG: '🇩🇿',
  EGY: '🇪🇬', GHA: '🇬🇭', CIV: '🇨🇮',
  COD: '🇨🇩', RSA: '🇿🇦', CPV: '🇨🇻',
  NZL: '🇳🇿', PAN: '🇵🇦', HAI: '🇭🇹',
  CUW: '🇨🇼',
  BIH: '🇧🇦', SWE: '🇸🇪',
};

// ============================================
// API 呼叫
// ============================================
async function callApiSports<T>(endpoint: string, params: Record<string, string | number>): Promise<T> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  const url = `https://${FOOTBALL_HOST}${endpoint}?${q.toString()}`;
  const res = await fetch(url, { headers: { 'x-apisports-key': API_KEY } });
  if (!res.ok) throw new Error(`API-Sports ${endpoint} 失敗: ${res.status} ${await res.text()}`);
  const data = await res.json() as { response: T; errors: unknown };
  return data.response;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// ============================================
// 型別
// ============================================
interface ApiTeam {
  id: number;
  name: string;
  logo: string;
}
interface StandingRow {
  rank: number;
  team: ApiTeam;
  group: string;            // "Group A"
  points: number;
}
interface StandingsResponse {
  league: { standings: StandingRow[][] };
}

interface Fixture {
  fixture: {
    id: number;
    date: string;           // ISO UTC
    venue: { name: string | null; city: string | null };
    status: { short: string; elapsed: number | null };
  };
  league: { round: string };
  teams: { home: ApiTeam; away: ApiTeam };
  goals: { home: number | null; away: number | null };
  score: { fulltime: { home: number | null; away: number | null } };
}

interface OpenFootballMatch {
  round: string;
  date: string;
  time: string;
  team1: string;
  team2: string;
  group?: string;
  ground: string;
}
interface OpenFootballJson { matches: OpenFootballMatch[] }

// ============================================
// Helpers
// ============================================
function statusFromApi(short: string): 'scheduled' | 'live' | 'finished' {
  // api-sports status codes: https://www.api-football.com/documentation-v3#section/Status
  if (['FT', 'AET', 'PEN', 'AWD', 'WO'].includes(short)) return 'finished';
  if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(short)) return 'live';
  return 'scheduled';
}

function classifyRound(round: string): { stage: 'group' | 'knockout'; matchday?: number } {
  // "Group Stage - 1" / "Group Stage - 2" / "Group Stage - 3"
  const groupMatch = /Group Stage - (\d)/.exec(round);
  if (groupMatch) return { stage: 'group', matchday: parseInt(groupMatch[1], 10) };
  return { stage: 'knockout' };
}

function isPlaceholder(name: string): boolean {
  if (/^[WLR]\d+$/.test(name)) return true;
  if (/^[123][A-L](\/[A-L])*$/.test(name)) return true;
  if (/^(Winner|Loser|Runner)/i.test(name)) return true;
  return false;
}

// openfootball 時區字串 → UTC Date
function parseOpenFootballKickoff(date: string, time: string): Date {
  const m = /^(\d{1,2}):(\d{2})\s+UTC([+-]\d+)$/.exec(time.trim());
  if (!m) return new Date(`${date}T${time.split(' ')[0]}:00Z`);
  const [, hh, mm, tzStr] = m;
  const tzOffset = parseInt(tzStr, 10);
  const utcHour = parseInt(hh, 10) - tzOffset;
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCHours(utcHour, parseInt(mm, 10), 0, 0);
  return base;
}

// ============================================
// 主流程
// ============================================
async function main() {
  console.log('🏆 FIFA 世界盃 2026 — API-Sports seed 開始');

  // 1) 抓 standings 取得 48 隊 + 分組
  console.log('📥 拉 api-sports 積分榜（取 48 隊 + Group A-L）...');
  const standings = await callApiSports<StandingsResponse[]>('/standings', { league: LEAGUE_ID, season: SEASON });
  if (!standings[0]) throw new Error('api-sports 沒回傳 standings');

  type TeamSeed = { apiId: number; name: string; logo: string; group: string };
  const teamSeeds: TeamSeed[] = [];
  for (const grp of standings[0].league.standings) {
    for (const row of grp) {
      teamSeeds.push({
        apiId: row.team.id,
        name: row.team.name,
        logo: row.team.logo,
        group: row.group.replace('Group ', ''),
      });
    }
  }
  console.log(`  ✓ 取得 ${teamSeeds.length} 隊`);
  if (teamSeeds.length !== 48) {
    console.warn(`  ⚠ 預期 48 隊，實際 ${teamSeeds.length} 隊`);
  }

  // 2) 抓 fixtures 取得 72 場小組賽
  console.log('📥 拉 api-sports 賽程...');
  const fixtures = await callApiSports<Fixture[]>('/fixtures', { league: LEAGUE_ID, season: SEASON });
  console.log(`  ✓ 取得 ${fixtures.length} 場`);

  // 3) 抓 openfootball 拿淘汰賽 placeholder
  console.log('📥 拉 openfootball 淘汰賽 placeholder...');
  const openfootball = await fetchJson<OpenFootballJson>(OPENFOOTBALL_URL);
  const knockoutOf = openfootball.matches.filter((m) => !m.round.startsWith('Matchday'));
  console.log(`  ✓ 取得 ${knockoutOf.length} 場淘汰賽`);

  // 4) 寫入 WorldCupTeam
  console.log('💾 寫入 WorldCupTeam...');
  const missingZh: string[] = [];
  const missingFifa: string[] = [];
  for (const t of teamSeeds) {
    const fifaCode = API_NAME_TO_FIFA[t.name];
    if (!fifaCode) {
      missingFifa.push(t.name);
      continue;
    }
    const nameZh = COUNTRY_ZH[fifaCode] ?? t.name;
    if (!COUNTRY_ZH[fifaCode]) missingZh.push(`${fifaCode} (${t.name})`);
    const flagEmoji = FLAG_EMOJI[fifaCode] ?? null;

    await prisma.worldCupTeam.upsert({
      where: { fifaCode },
      update: {
        nameEn: t.name,
        nameZh,
        flagEmoji,
        groupName: t.group,
        apiTeamId: t.apiId,
        logoUrl: t.logo,
      },
      create: {
        fifaCode,
        nameEn: t.name,
        nameZh,
        flagEmoji,
        groupName: t.group,
        apiTeamId: t.apiId,
        logoUrl: t.logo,
      },
    });
  }
  if (missingFifa.length) console.warn(`  ⚠ 找不到 FIFA Code：${missingFifa.join(', ')}`);
  if (missingZh.length) console.warn(`  ⚠ 缺少中譯：${missingZh.join(', ')}`);
  console.log(`  ✓ ${teamSeeds.length - missingFifa.length} 隊已寫入`);

  // 5) 建 apiTeamId → ourTeamId map
  const dbTeams = await prisma.worldCupTeam.findMany();
  const apiIdToOurId = new Map<number, number>();
  for (const t of dbTeams) {
    if (t.apiTeamId) apiIdToOurId.set(t.apiTeamId, t.id);
  }

  // 6) 寫入小組賽（matchNumber 1-72，按 kickoffAt ASC）
  console.log('💾 寫入 WorldCupMatch（小組賽 1-72）...');
  const sortedFixtures = [...fixtures].sort((a, b) =>
    new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime(),
  );

  let matchNumber = 0;
  for (const f of sortedFixtures) {
    matchNumber++;
    const cls = classifyRound(f.league.round);
    if (cls.stage !== 'group') continue;

    const homeId = apiIdToOurId.get(f.teams.home.id) ?? null;
    const awayId = apiIdToOurId.get(f.teams.away.id) ?? null;
    if (!homeId) console.warn(`  ⚠ 找不到 home team: ${f.teams.home.name} (id=${f.teams.home.id})`);
    if (!awayId) console.warn(`  ⚠ 找不到 away team: ${f.teams.away.name} (id=${f.teams.away.id})`);

    // 從 home team 拿 group（standings 結構保證 home/away 同組）
    const homeTeam = dbTeams.find((t) => t.apiTeamId === f.teams.home.id);
    const groupName = homeTeam?.groupName ? `Group ${homeTeam.groupName}` : null;

    await prisma.worldCupMatch.upsert({
      where: { matchNumber },
      update: {
        round: `Matchday ${cls.matchday}`,
        stage: 'group',
        groupName,
        kickoffAt: new Date(f.fixture.date),
        venue: f.fixture.venue.name ?? 'TBD',
        venueCity: f.fixture.venue.city,
        apiFixtureId: f.fixture.id,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homePlaceholder: null,
        awayPlaceholder: null,
        homeScore: f.goals.home,
        awayScore: f.goals.away,
        status: statusFromApi(f.fixture.status.short),
        liveMinute: f.fixture.status.elapsed,
      },
      create: {
        matchNumber,
        round: `Matchday ${cls.matchday}`,
        stage: 'group',
        groupName,
        kickoffAt: new Date(f.fixture.date),
        venue: f.fixture.venue.name ?? 'TBD',
        venueCity: f.fixture.venue.city,
        apiFixtureId: f.fixture.id,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeScore: f.goals.home,
        awayScore: f.goals.away,
        status: statusFromApi(f.fixture.status.short),
        liveMinute: f.fixture.status.elapsed,
      },
    });
  }
  console.log(`  ✓ ${matchNumber} 場小組賽已寫入`);

  // 7) 寫入淘汰賽 placeholder（matchNumber 73 起）
  console.log('💾 寫入 WorldCupMatch（淘汰賽 placeholder）...');
  let knockoutNum = matchNumber; // 接續編號
  for (const m of knockoutOf) {
    knockoutNum++;
    const kickoffAt = parseOpenFootballKickoff(m.date, m.time);
    const team1IsPh = isPlaceholder(m.team1);
    const team2IsPh = isPlaceholder(m.team2);
    // 淘汰賽都還沒抽出來，team1/team2 應該都是 placeholder
    await prisma.worldCupMatch.upsert({
      where: { matchNumber: knockoutNum },
      update: {
        round: m.round,
        stage: 'knockout',
        groupName: null,
        kickoffAt,
        venue: m.ground,
        homeTeamId: null,
        awayTeamId: null,
        homePlaceholder: team1IsPh ? m.team1 : m.team1,
        awayPlaceholder: team2IsPh ? m.team2 : m.team2,
        homeScore: null,
        awayScore: null,
        status: 'scheduled',
        liveMinute: null,
      },
      create: {
        matchNumber: knockoutNum,
        round: m.round,
        stage: 'knockout',
        groupName: null,
        kickoffAt,
        venue: m.ground,
        homePlaceholder: team1IsPh ? m.team1 : m.team1,
        awayPlaceholder: team2IsPh ? m.team2 : m.team2,
        status: 'scheduled',
      },
    });
  }
  console.log(`  ✓ ${knockoutNum - matchNumber} 場淘汰賽已寫入（matchNumber ${matchNumber + 1}-${knockoutNum}）`);

  // 8) 看板存在性確認
  const soccerCat = await prisma.category.findUnique({ where: { slug: 'soccer' } });
  if (soccerCat) {
    await prisma.board.upsert({
      where: { slug: 'world-cup' },
      update: {},
      create: {
        slug: 'world-cup',
        name: '世界盃',
        icon: '🏆',
        description: 'FIFA 世界盃',
        sortOrder: 9,
        categoryId: soccerCat.id,
      },
    });
    console.log('  ✓ 世界盃看板已就緒');
  }

  console.log('\n✅ 完成！');
  console.log(`   - ${teamSeeds.length - missingFifa.length} 隊（含 apiTeamId / logoUrl）`);
  console.log(`   - ${matchNumber} 場小組賽（含 apiFixtureId）`);
  console.log(`   - ${knockoutNum - matchNumber} 場淘汰賽 placeholder`);
}

main()
  .catch((e) => {
    console.error('❌ 失敗：', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
