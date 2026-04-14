/**
 * 從 MLB 官方 API 拉所有現役球員，用 Claude 翻譯後存入 Translation 表
 *
 * 執行：tsx apps/api/scripts/seed-mlb-players.ts
 * 備註：用 MLB 官方 player ID（不是 API-Sports ID）
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient } from '@betting-forum/database';

const prisma = new PrismaClient();
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY!;

if (!CLAUDE_KEY) {
  console.error('請設定 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY');
  process.exit(1);
}

const SEASON = 2025;

interface Player {
  id: number;
  fullName: string;
  firstName: string;
  lastName: string;
  position: string;
  jerseyNumber: string;
  teamId: number;
  teamName: string;
  birthCountry?: string;
}

async function fetchAllPlayers(): Promise<Player[]> {
  console.log('📥 從 MLB 官方 API 拉各隊 Roster...');

  // 先拉所有球隊
  const teamsRes = await fetch(`https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${SEASON}`);
  const teamsData = await teamsRes.json() as { teams: any[] };

  const players: Player[] = [];

  for (const team of teamsData.teams) {
    process.stdout.write(`   [${team.abbreviation}] ${team.name}... `);
    const rosterRes = await fetch(
      `https://statsapi.mlb.com/api/v1/teams/${team.id}/roster?season=${SEASON}&rosterType=active`,
    );
    const rosterData = await rosterRes.json() as { roster: any[] };
    const roster = rosterData.roster ?? [];

    for (const entry of roster) {
      // 取得完整資料
      players.push({
        id: entry.person.id,
        fullName: entry.person.fullName,
        firstName: entry.person.firstName ?? '',
        lastName: entry.person.lastName ?? '',
        position: entry.position?.abbreviation ?? '',
        jerseyNumber: entry.jerseyNumber ?? '',
        teamId: team.id,
        teamName: team.name,
      });
    }

    console.log(`${roster.length} 人`);
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`   共 ${players.length} 位球員\n`);
  return players;
}

async function findMissing(players: Player[]): Promise<Player[]> {
  const ids = players.map((p) => p.id);
  const existing = await prisma.translation.findMany({
    where: {
      entityType: 'player',
      sport: 'baseball',
      apiId: { in: ids },
    },
    select: { apiId: true },
  });
  const existingIds = new Set(existing.map((e) => e.apiId));
  return players.filter((p) => !existingIds.has(p.id));
}

async function translateBatch(batch: Player[]): Promise<number> {
  const items = batch
    .map((p) => `${p.id}: ${p.fullName} (${p.position}, ${p.teamName})`)
    .join('\n');

  const prompt = `你是專業的 MLB 棒球翻譯員，負責將球員英文名翻譯為**台灣繁體中文慣用譯名**。

【翻譯規則】
1. 使用**台灣用語**：
   - Shohei Ohtani → 大谷翔平（日本球員用漢字名）
   - Aaron Judge → 艾倫賈吉
   - Juan Soto → 胡安索托
   - Mookie Betts → 穆奇貝茲
   - Ronald Acuña Jr. → 小艾庫尼亞
2. 日韓球員有慣用漢字名就用（如 山本由伸、金河成）
3. 拉美球員採音譯，簡稱通常用姓氏
4. 有些球員有台灣慣用的暱稱（如 Fernando Tatis Jr. → 小塔，Shohei Ohtani → 大谷）可填 nickname
5. **只回傳 JSON**，不要加解釋文字
6. 格式：
{
  "660271": { "name": "大谷翔平", "short": "大谷", "nickname": "二刀流" },
  "592450": { "name": "艾倫賈吉", "short": "賈吉" }
}

【要翻譯的球員】（id: 英文名 (位置, 球隊)）
${items}

只回傳 JSON：`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(90000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude ${response.status}: ${err}`);
  }

  const data = await response.json() as any;
  const text = data.content[0]?.text?.trim() ?? '';
  const usage = data.usage;
  const cost = (usage.input_tokens * 1.0 + usage.output_tokens * 5.0) / 1_000_000;

  await prisma.translationUsage.create({
    data: {
      model: 'claude-haiku-4-5-20251001',
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costUsd: cost,
      entityType: 'player',
      itemCount: batch.length,
      triggeredBy: 'manual',
    },
  });

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error(`   ❌ 解析失敗：${text.slice(0, 200)}`);
    return 0;
  }

  let parsed: Record<string, { name: string; short?: string; nickname?: string }>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(`   ❌ JSON 錯誤：${err}`);
    return 0;
  }

  let count = 0;
  for (const player of batch) {
    const tr = parsed[String(player.id)];
    if (!tr?.name) continue;

    try {
      await prisma.translation.upsert({
        where: {
          entityType_apiId_sport: {
            entityType: 'player',
            apiId: player.id,
            sport: 'baseball',
          },
        },
        create: {
          entityType: 'player',
          apiId: player.id,
          sport: 'baseball',
          nameEn: player.fullName,
          nameZhTw: tr.name,
          shortName: tr.short,
          nickname: tr.nickname,
          source: 'ai',
          verified: false,
          extra: {
            position: player.position,
            jerseyNumber: player.jerseyNumber,
            mlbTeamId: player.teamId,
          },
        },
        update: {
          nameZhTw: tr.name,
          shortName: tr.short,
          nickname: tr.nickname,
        },
      });
      count++;
    } catch (err) {
      console.error(`   ❌ 寫入失敗 (${player.id} ${player.fullName}):`, err);
    }
  }

  console.log(`   ✅ ${count}/${batch.length}，成本 $${cost.toFixed(4)}`);
  return count;
}

async function main() {
  console.log('\n⚾ MLB 現役球員批次翻譯\n');

  // 1. 拉所有現役球員
  const allPlayers = await fetchAllPlayers();

  // 2. 找出未翻譯的
  const missing = await findMissing(allPlayers);
  console.log(`⏳ 未翻譯：${missing.length} / ${allPlayers.length}\n`);

  if (missing.length === 0) {
    console.log('✅ 所有球員都已翻譯！');
    return;
  }

  // 3. 批次翻譯（一批 40 人）
  const BATCH_SIZE = 40;
  let totalTranslated = 0;

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(missing.length / BATCH_SIZE);
    console.log(`🔤 批次 ${batchNum}/${totalBatches} (${batch.length} 人)`);

    try {
      totalTranslated += await translateBatch(batch);
    } catch (err) {
      console.error(`   ❌ 批次失敗：${err}`);
    }

    // 避免打太快
    await new Promise((r) => setTimeout(r, 1000));
  }

  // 4. 統計
  const usage = await prisma.translationUsage.aggregate({
    where: {
      entityType: 'player',
      date: { gte: new Date(Date.now() - 2 * 3600 * 1000) },
    },
    _sum: { costUsd: true, inputTokens: true, outputTokens: true },
  });

  console.log(`\n✨ 完成！`);
  console.log(`   翻譯 ${totalTranslated} 位球員`);
  console.log(`   總 tokens：${usage._sum.inputTokens} + ${usage._sum.outputTokens}`);
  console.log(`   總成本：$${(usage._sum.costUsd ?? 0).toFixed(4)}（約 NT$${Math.ceil((usage._sum.costUsd ?? 0) * 32)}）`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
