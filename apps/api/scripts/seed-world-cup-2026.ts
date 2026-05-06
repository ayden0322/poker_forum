/**
 * FIFA 世界盃 2026 賽程資料匯入腳本
 *
 * 資料來源：GitHub openfootball/worldcup.json（公開、無需 API key）
 *   - 48 隊參賽資料：worldcup.teams_meta.json
 *   - 104 場比賽賽程：worldcup.json
 *
 * 用法：
 *   pnpm exec tsx apps/api/scripts/seed-world-cup-2026.ts
 *   pnpm exec tsx apps/api/scripts/seed-world-cup-2026.ts --dev-mock
 *
 * --dev-mock 模式（開發測試用）：
 *   - 把前 12 場（小組賽第 1 輪部分）標為 finished + 隨機合理比分
 *   - 把接下來 4 場標為 live + 即時比分
 *   - 其他保持 scheduled
 *   - 不修改原始日期，方便驗證 widget UI 完整呈現
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient } from '@betting-forum/database';

const prisma = new PrismaClient();

const TEAMS_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.teams_meta.json';
const FIXTURES_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

const IS_DEV_MOCK = process.argv.includes('--dev-mock');

// ===== 48 隊國名中文對照（FIFA Code → 繁體中文）=====
// 不走 Claude API：國名翻譯穩定且常見，硬編碼最可靠
const COUNTRY_ZH: Record<string, string> = {
  MEX: '墨西哥', CAN: '加拿大', USA: '美國',
  ARG: '阿根廷', BRA: '巴西', URU: '烏拉圭', COL: '哥倫比亞',
  ECU: '厄瓜多', PAR: '巴拉圭', VEN: '委內瑞拉', BOL: '玻利維亞',
  CHI: '智利', PER: '秘魯',
  ENG: '英格蘭', FRA: '法國', ESP: '西班牙', GER: '德國',
  ITA: '義大利', POR: '葡萄牙', NED: '荷蘭', BEL: '比利時',
  CRO: '克羅埃西亞', SUI: '瑞士', DEN: '丹麥', AUT: '奧地利',
  POL: '波蘭', NOR: '挪威', SCO: '蘇格蘭', SVN: '斯洛維尼亞',
  CZE: '捷克', HUN: '匈牙利', SRB: '塞爾維亞', WAL: '威爾斯',
  IRL: '愛爾蘭', SVK: '斯洛伐克', UKR: '烏克蘭', TUR: '土耳其',
  JPN: '日本', KOR: '南韓', AUS: '澳洲', IRN: '伊朗',
  KSA: '沙烏地阿拉伯', QAT: '卡達', UZB: '烏茲別克', JOR: '約旦',
  IRQ: '伊拉克', UAE: '阿拉伯聯合大公國',
  MAR: '摩洛哥', SEN: '塞內加爾', TUN: '突尼西亞', ALG: '阿爾及利亞',
  EGY: '埃及', GHA: '迦納', CIV: '象牙海岸', NGA: '奈及利亞',
  CMR: '喀麥隆', RSA: '南非', MLI: '馬利', CPV: '維德角',
  NZL: '紐西蘭', PAN: '巴拿馬', CRC: '哥斯大黎加', JAM: '牙買加',
  HAI: '海地', HON: '宏都拉斯', SLV: '薩爾瓦多', GUA: '瓜地馬拉',
  CUW: '庫拉索', SUR: '蘇利南', NCA: '尼加拉瓜',
  BIH: '波士尼亞與赫塞哥維納', SWE: '瑞典', COD: '剛果民主共和國',
  RUS: '俄羅斯', GRE: '希臘', ROU: '羅馬尼亞', BUL: '保加利亞',
  ISL: '冰島', FIN: '芬蘭', LBY: '利比亞', GAB: '加彭',
};

// ===== Fetch helpers =====
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

interface TeamMeta {
  name: string;
  continent: string;
  flag_icon: string;
  fifa_code: string;
  group?: string;
  confed: string;
}

interface MatchRaw {
  round: string;
  date: string;       // "2026-06-11"
  time: string;       // "13:00 UTC-6"
  team1: string;      // 隊名 or "W101"
  team2: string;
  group?: string;     // "Group A"
  ground: string;
  score?: { ft: [number, number] };
}

interface WorldCupJson {
  name: string;
  matches: MatchRaw[];
}

// ===== 時間解析：把 "2026-06-11" + "13:00 UTC-6" 轉成 UTC Date =====
function parseKickoff(date: string, time: string): Date {
  // time 範例: "13:00 UTC-6", "20:00 UTC-4"
  const m = /^(\d{1,2}):(\d{2})\s+UTC([+-]\d+)$/.exec(time.trim());
  if (!m) {
    // fallback：直接當 UTC
    return new Date(`${date}T${time.split(' ')[0]}:00Z`);
  }
  const [, hh, mm, tzStr] = m;
  const tzOffset = parseInt(tzStr, 10);          // -6 = UTC-6
  // 本地時間 hh:mm（UTC-6） → UTC = 本地 + 6 小時
  const utcHour = parseInt(hh, 10) - tzOffset;   // 13 - (-6) = 19
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCHours(utcHour, parseInt(mm, 10), 0, 0);
  return base;
}

// ===== Stage 分類 =====
function classifyStage(round: string): 'group' | 'knockout' {
  if (round.startsWith('Matchday')) return 'group';
  return 'knockout';
}

// ===== Placeholder 偵測 =====
// 涵蓋 openfootball 常見格式：
//   W101 / L52       淘汰賽勝/敗者
//   1A / 2B / 3C     小組第 1/2/3 名
//   3A/B/C/D/F       多組第三名分支
//   Winner Match 49  口語 placeholder
function isPlaceholder(name: string): boolean {
  if (/^[WLR]\d+$/.test(name)) return true;            // W101, L52, R16
  if (/^[123][A-L](\/[A-L])*$/.test(name)) return true; // 1A, 3A/B/C/D/F
  if (/^(Winner|Loser|Runner)/i.test(name)) return true;
  return false;
}

// ===== Mock 比分產生器（DEV 模式用）=====
function mockScore(): [number, number] {
  // 真實世界盃常見比分分佈
  const r = Math.random();
  if (r < 0.15) return [0, 0];
  if (r < 0.35) return [1, 0];
  if (r < 0.50) return [2, 1];
  if (r < 0.65) return [1, 1];
  if (r < 0.78) return [2, 0];
  if (r < 0.88) return [3, 1];
  if (r < 0.94) return [3, 2];
  return [Math.floor(Math.random() * 4), Math.floor(Math.random() * 3)];
}

async function main() {
  console.log('🌍 開始匯入 FIFA 世界盃 2026 賽程資料...');
  if (IS_DEV_MOCK) console.log('⚠️  DEV MOCK 模式：將為部分比賽生成假比分');

  // 1) 拉資料
  console.log('📥 從 GitHub 抓取資料...');
  const [teams, fixtures] = await Promise.all([
    fetchJson<TeamMeta[]>(TEAMS_URL),
    fetchJson<WorldCupJson>(FIXTURES_URL),
  ]);
  console.log(`  ✓ 隊伍：${teams.length} 隊`);
  console.log(`  ✓ 賽程：${fixtures.matches.length} 場`);

  // 2) 寫入隊伍
  console.log('💾 寫入 WorldCupTeam...');
  for (const t of teams) {
    const nameZh = COUNTRY_ZH[t.fifa_code] ?? t.name;
    if (!COUNTRY_ZH[t.fifa_code]) {
      console.warn(`  ⚠ 缺少中譯：${t.fifa_code} (${t.name})`);
    }
    await prisma.worldCupTeam.upsert({
      where: { fifaCode: t.fifa_code },
      update: {
        nameEn: t.name,
        nameZh,
        flagEmoji: t.flag_icon,
        groupName: t.group ?? null,
        continent: t.continent,
        confed: t.confed,
      },
      create: {
        fifaCode: t.fifa_code,
        nameEn: t.name,
        nameZh,
        flagEmoji: t.flag_icon,
        groupName: t.group ?? null,
        continent: t.continent,
        confed: t.confed,
      },
    });

    // 同步寫入 Translation 表（沿用既有翻譯系統）
    // 這裡用 fifaCode 的 ASCII 碼總和當 apiId（保證唯一）
    const apiId = t.fifa_code.split('').reduce((s, c) => s + c.charCodeAt(0) * 1000, 0);
    await prisma.translation.upsert({
      where: { entityType_apiId_sport: { entityType: 'team', apiId, sport: 'football' } },
      update: { nameEn: t.name, nameZhTw: nameZh, source: 'manual', verified: true },
      create: {
        entityType: 'team',
        apiId,
        sport: 'football',
        nameEn: t.name,
        nameZhTw: nameZh,
        source: 'manual',
        verified: true,
        extra: { fifaCode: t.fifa_code, flag: t.flag_icon, confed: t.confed },
      },
    });
  }
  console.log(`  ✓ ${teams.length} 隊已寫入`);

  // 3) 建立 fifaCode + 隊名 lookup
  const allDbTeams = await prisma.worldCupTeam.findMany();
  const teamByName = new Map<string, number>();
  for (const t of allDbTeams) {
    teamByName.set(t.nameEn.toLowerCase(), t.id);
  }

  // 4) 寫入比賽
  console.log('💾 寫入 WorldCupMatch...');
  let matchNum = 0;
  let mockedFinished = 0;
  let mockedLive = 0;

  for (const m of fixtures.matches) {
    matchNum++;
    const kickoffAt = parseKickoff(m.date, m.time);
    const stage = classifyStage(m.round);

    const team1IsPh = isPlaceholder(m.team1);
    const team2IsPh = isPlaceholder(m.team2);
    const homeTeamId = team1IsPh ? null : teamByName.get(m.team1.toLowerCase()) ?? null;
    const awayTeamId = team2IsPh ? null : teamByName.get(m.team2.toLowerCase()) ?? null;

    if (!team1IsPh && !homeTeamId) console.warn(`  ⚠ 找不到隊伍：${m.team1}`);
    if (!team2IsPh && !awayTeamId) console.warn(`  ⚠ 找不到隊伍：${m.team2}`);

    // === DEV MOCK 比分邏輯 ===
    let status: 'scheduled' | 'live' | 'finished' = 'scheduled';
    let homeScore: number | null = null;
    let awayScore: number | null = null;
    let liveMinute: number | null = null;

    if (IS_DEV_MOCK && stage === 'group' && homeTeamId && awayTeamId) {
      if (mockedFinished < 12) {
        // 前 12 場小組賽 → finished
        const [a, b] = mockScore();
        homeScore = a;
        awayScore = b;
        status = 'finished';
        mockedFinished++;
      } else if (mockedLive < 4) {
        // 接下來 4 場 → live
        const [a, b] = mockScore();
        homeScore = a;
        awayScore = b;
        status = 'live';
        liveMinute = 30 + Math.floor(Math.random() * 60); // 30~89 分鐘
        mockedLive++;
      }
    }

    // 真實官方比分（GitHub 資料若有）
    if (m.score?.ft && !IS_DEV_MOCK) {
      homeScore = m.score.ft[0];
      awayScore = m.score.ft[1];
      status = 'finished';
    }

    await prisma.worldCupMatch.upsert({
      where: { matchNumber: matchNum },
      update: {
        round: m.round,
        stage,
        groupName: m.group ?? null,
        kickoffAt,
        venue: m.ground,
        homeTeamId,
        awayTeamId,
        homePlaceholder: team1IsPh ? m.team1 : null,
        awayPlaceholder: team2IsPh ? m.team2 : null,
        homeScore,
        awayScore,
        status,
        liveMinute,
      },
      create: {
        matchNumber: matchNum,
        round: m.round,
        stage,
        groupName: m.group ?? null,
        kickoffAt,
        venue: m.ground,
        homeTeamId,
        awayTeamId,
        homePlaceholder: team1IsPh ? m.team1 : null,
        awayPlaceholder: team2IsPh ? m.team2 : null,
        homeScore,
        awayScore,
        status,
        liveMinute,
      },
    });
  }
  console.log(`  ✓ ${matchNum} 場已寫入`);
  if (IS_DEV_MOCK) {
    console.log(`  ✓ 模擬：${mockedFinished} 場已完賽 + ${mockedLive} 場進行中`);
  }

  // 5) 確認世界盃看板存在（seed.ts 已建立，但保險再 upsert）
  const soccerCat = await prisma.category.findUnique({ where: { slug: 'soccer' } });
  if (soccerCat) {
    await prisma.board.upsert({
      where: { slug: 'world-cup' },
      update: {},
      create: {
        slug: 'world-cup',
        name: '世界盃',
        icon: '🌍',
        description: 'FIFA 世界盃',
        sortOrder: 9,
        categoryId: soccerCat.id,
      },
    });
    console.log('  ✓ 世界盃看板已就緒');
  }

  console.log('✅ 完成！');
}

main()
  .catch((e) => {
    console.error('❌ 失敗：', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
