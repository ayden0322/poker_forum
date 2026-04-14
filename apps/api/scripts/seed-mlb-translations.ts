/**
 * MLB 實體首次批次翻譯腳本
 * 執行：pnpm exec tsx apps/api/scripts/seed-mlb-translations.ts
 *
 * 會翻譯：
 * - 30 支 MLB 球隊
 * - 所有現役球員（約 1,200 人）
 * - 30 個球場
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
// 從專案根目錄讀 .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import { PrismaClient } from '@betting-forum/database';

const MLB_LEAGUE_ID = 1;
const MLB_SEASON = 2026;
const API_HOST = 'v1.baseball.api-sports.io';

const prisma = new PrismaClient();

const API_KEY = process.env.API_SPORTS_KEY!;
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY!;

if (!API_KEY || !CLAUDE_KEY) {
  console.error('請設定 API_SPORTS_KEY 和 ANTHROPIC_API_KEY (或 CLAUDE_API_KEY) 環境變數');
  process.exit(1);
}

interface TranslatableEntity {
  apiId: number;
  nameEn: string;
  entityType: 'team' | 'player' | 'venue';
  logo?: string;
  extra?: Record<string, unknown>;
}

async function callApi<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T[]> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) query.set(k, String(v));

  const url = `https://${API_HOST}${endpoint}?${query}`;
  const res = await fetch(url, {
    headers: { 'x-apisports-key': API_KEY },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    console.error(`API-Sports ${res.status}: ${await res.text()}`);
    return [];
  }

  const data = (await res.json()) as { response: T[] };
  return data.response ?? [];
}

async function fetchTeams(): Promise<TranslatableEntity[]> {
  console.log('📥 拉 MLB 球隊列表...');
  const teams = await callApi<any>('/teams', { league: MLB_LEAGUE_ID, season: MLB_SEASON });
  console.log(`   取得 ${teams.length} 支球隊`);

  return teams.map((t) => ({
    entityType: 'team' as const,
    apiId: t.id,
    nameEn: t.name,
    logo: t.logo,
  }));
}

async function fetchVenues(teams: TranslatableEntity[]): Promise<TranslatableEntity[]> {
  console.log('📥 拉 MLB 球場列表（從球隊資料）...');
  // Baseball API 的 teams 端點通常已含 venue，這裡用球隊對應的球場
  // 但 v1.baseball 可能沒有 venue 端點，我們從 /teams?id=X 逐一拉
  const venues: TranslatableEntity[] = [];
  const seen = new Set<number>();

  for (const team of teams) {
    try {
      const result = await callApi<any>('/teams', { id: team.apiId });
      for (const r of result) {
        if (r.venue?.id && !seen.has(r.venue.id)) {
          seen.add(r.venue.id);
          venues.push({
            entityType: 'venue',
            apiId: r.venue.id,
            nameEn: r.venue.name,
          });
        }
      }
    } catch {
      // 忽略
    }
  }

  console.log(`   取得 ${venues.length} 個球場`);
  return venues;
}

async function fetchPlayers(teams: TranslatableEntity[]): Promise<TranslatableEntity[]> {
  console.log('📥 拉 MLB 球員列表（逐隊）...');
  const players: TranslatableEntity[] = [];

  for (const team of teams) {
    process.stdout.write(`   [${team.apiId}] ${team.nameEn}... `);
    const result = await callApi<any>('/players', {
      team: team.apiId,
      season: MLB_SEASON,
    });

    const teamPlayers = result.map((p: any) => ({
      entityType: 'player' as const,
      apiId: p.id,
      nameEn: `${p.firstname ?? ''} ${p.lastname ?? ''}`.trim() || p.name || 'Unknown',
      extra: p.position ? { position: p.position } : undefined,
    }));

    players.push(...teamPlayers);
    console.log(`${teamPlayers.length} 人`);

    // 避免打太快
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`   共 ${players.length} 位球員`);
  return players;
}

async function findMissingTranslations(
  entities: TranslatableEntity[],
): Promise<TranslatableEntity[]> {
  const missing: TranslatableEntity[] = [];

  const byType = new Map<string, TranslatableEntity[]>();
  for (const e of entities) {
    if (!byType.has(e.entityType)) byType.set(e.entityType, []);
    byType.get(e.entityType)!.push(e);
  }

  for (const [entityType, list] of byType) {
    const existing = await prisma.translation.findMany({
      where: {
        entityType,
        sport: 'baseball',
        apiId: { in: list.map((e) => e.apiId) },
      },
      select: { apiId: true },
    });
    const existingIds = new Set(existing.map((e) => e.apiId));
    for (const e of list) {
      if (!existingIds.has(e.apiId)) missing.push(e);
    }
  }

  return missing;
}

async function translateBatch(batch: TranslatableEntity[]): Promise<number> {
  if (batch.length === 0) return 0;

  const entityType = batch[0].entityType;
  const typeLabel = { team: '球隊', player: '球員', venue: '球場', league: '聯賽', coach: '教練', country: '國家' }[entityType] || entityType;

  const rule = {
    team: '球隊名稱提供簡稱（2-3 字），例如「洛杉磯湖人」簡稱「湖人」',
    player: '球員名字直接音譯或使用慣用翻譯，台灣習慣的譯名優先（如 Shohei Ohtani → 大谷翔平）',
    venue: '球場名稱採音譯或意譯，例如「Yankee Stadium → 洋基球場」',
  }[entityType] || '';

  const items = batch
    .map((e) => {
      const extra = e.extra ? ` (${JSON.stringify(e.extra)})` : '';
      return `${e.apiId}: ${e.nameEn}${extra}`;
    })
    .join('\n');

  const prompt = `你是專業的運動翻譯員，負責將 MLB 棒球${typeLabel}的英文名稱翻譯為**台灣繁體中文慣用譯名**。

【翻譯規則】
1. 使用**台灣用語**，不要用中國大陸譯名
   - 例如：Yankees → 洋基、Dodgers → 道奇、Red Sox → 紅襪
   - 例如：Shohei Ohtani → 大谷翔平（不要翻成「大谷」）
   - 例如：Aaron Judge → 艾倫賈吉（或保留音譯）
2. ${rule}
3. 日韓球員名稱使用他們的漢字名（如有）
4. **只回傳 JSON 格式**，不要加任何解釋文字
5. 格式：
{
  "1": { "name": "紐約洋基", "short": "洋基", "nickname": "轟炸機" },
  "2": { "name": "..." }
}

【要翻譯的${typeLabel}】
${items}

只回傳 JSON，不要其他文字：`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude ${response.status}: ${errText}`);
  }

  const data = await response.json() as any;
  const text = data.content[0]?.text?.trim() ?? '';
  const usage = data.usage;

  // 記錄使用量
  const cost = (usage.input_tokens * 1.0 + usage.output_tokens * 5.0) / 1_000_000;
  await prisma.translationUsage.create({
    data: {
      model: 'claude-haiku-4-5-20251001',
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costUsd: cost,
      entityType,
      itemCount: batch.length,
      triggeredBy: 'manual',
    },
  });

  // 解析 JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error(`❌ 解析失敗：${text.slice(0, 300)}`);
    return 0;
  }

  const parsed = JSON.parse(jsonMatch[0]);
  let count = 0;

  for (const entity of batch) {
    const tr = parsed[String(entity.apiId)];
    if (!tr?.name) continue;

    await prisma.translation.upsert({
      where: {
        entityType_apiId_sport: {
          entityType: entity.entityType,
          apiId: entity.apiId,
          sport: 'baseball',
        },
      },
      create: {
        entityType: entity.entityType,
        apiId: entity.apiId,
        sport: 'baseball',
        nameEn: entity.nameEn,
        nameZhTw: tr.name,
        shortName: tr.short,
        nickname: tr.nickname,
        logo: entity.logo,
        source: 'ai',
        verified: false,
        extra: entity.extra as any,
      },
      update: {
        nameZhTw: tr.name,
        shortName: tr.short,
        nickname: tr.nickname,
        logo: entity.logo,
      },
    });
    count++;
  }

  console.log(`   ✅ 批次翻譯 ${count}/${batch.length}，成本 $${cost.toFixed(4)}`);
  return count;
}

async function main() {
  console.log('\n🚀 MLB 實體批次翻譯腳本\n');

  // 1. 拉所有實體
  const teams = await fetchTeams();
  const venues = await fetchVenues(teams);
  const players = await fetchPlayers(teams);

  const all = [...teams, ...venues, ...players];
  console.log(`\n📊 總實體數：${all.length}（球隊 ${teams.length} + 球場 ${venues.length} + 球員 ${players.length}）\n`);

  // 2. 找未翻譯的
  const missing = await findMissingTranslations(all);
  console.log(`⏳ 未翻譯：${missing.length} / ${all.length}\n`);

  if (missing.length === 0) {
    console.log('✅ 所有實體都已翻譯完成！');
    return;
  }

  // 3. 按類型分批翻譯
  const byType = new Map<string, TranslatableEntity[]>();
  for (const e of missing) {
    if (!byType.has(e.entityType)) byType.set(e.entityType, []);
    byType.get(e.entityType)!.push(e);
  }

  let totalCost = 0;
  let totalTranslated = 0;

  for (const [type, list] of byType) {
    console.log(`\n🔤 翻譯 ${type}（${list.length} 個）`);

    const BATCH_SIZE = 50;
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);
      try {
        const count = await translateBatch(batch);
        totalTranslated += count;
      } catch (err) {
        console.error(`❌ 批次失敗：${err}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // 4. 統計
  const usage = await prisma.translationUsage.aggregate({
    where: { triggeredBy: 'manual', date: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
    _sum: { costUsd: true, inputTokens: true, outputTokens: true },
  });

  console.log(`\n✨ 完成！`);
  console.log(`   翻譯 ${totalTranslated} 個實體`);
  console.log(`   總 tokens：${usage._sum.inputTokens} input + ${usage._sum.outputTokens} output`);
  console.log(`   總成本：$${(usage._sum.costUsd ?? 0).toFixed(4)}（約 NT$${Math.ceil((usage._sum.costUsd ?? 0) * 32)}）`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
