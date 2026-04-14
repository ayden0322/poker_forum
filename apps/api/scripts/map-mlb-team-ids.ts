/**
 * 建立 API-Sports Team ID ↔ MLB 官方 Team ID 對應表
 * 透過英文隊名比對，把 MLB 官方 ID 寫入 Translation.extra
 *
 * 執行：tsx apps/api/scripts/map-mlb-team-ids.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient } from '@betting-forum/database';

const prisma = new PrismaClient();

interface MLBTeam {
  id: number;
  name: string;
  abbreviation: string;
  teamName: string;
  locationName: string;
}

async function fetchMLBTeams(): Promise<MLBTeam[]> {
  const res = await fetch('https://statsapi.mlb.com/api/v1/teams?sportId=1&season=2025');
  const data = await res.json() as { teams: MLBTeam[] };
  return data.teams ?? [];
}

async function main() {
  console.log('\n🔗 建立 API-Sports ↔ MLB 官方 Team ID 對應\n');

  // 1. 拉 MLB 官方球隊
  const mlbTeams = await fetchMLBTeams();
  console.log(`📥 MLB 官方：${mlbTeams.length} 支球隊`);

  // 2. 拉 API-Sports 球隊（從 Translation 表）
  const apiSportsTeams = await prisma.translation.findMany({
    where: { entityType: 'team', sport: 'baseball' },
    orderBy: { apiId: 'asc' },
  });
  console.log(`📥 API-Sports：${apiSportsTeams.length} 支球隊\n`);

  // 3. 建立名稱對照
  // MLB 官方：name 通常是「紐約洋基」= "New York Yankees"
  // API-Sports：nameEn 通常是 "New York Yankees"
  // 可以直接比對，但要處理一些差異：
  //   - Athletics 問題：API-Sports 叫 "Athletics"，MLB 官方可能叫 "Athletics" 或 "Oakland Athletics"
  //   - St.Louis vs St. Louis（標點符號差異）

  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/\s+/g, '')
      .replace(/\./g, '')
      .replace(/^theoakland/, 'oakland')
      .trim();

  const mlbByName = new Map<string, MLBTeam>();
  for (const t of mlbTeams) {
    mlbByName.set(normalize(t.name), t);
    // 也存一個 teamName 版本（ex: "Yankees"）
    mlbByName.set(normalize(t.teamName), t);
  }

  let matched = 0;
  let unmatched: Array<{ apiId: number; nameEn: string }> = [];

  for (const team of apiSportsTeams) {
    let mlbTeam = mlbByName.get(normalize(team.nameEn));

    // 特殊處理
    if (!mlbTeam) {
      // "American League" / "National League" 不是球隊
      if (team.nameEn.includes('League') && !team.nameEn.includes('Athletics')) {
        console.log(`⏭️  跳過（非球隊）：${team.nameEn}`);
        continue;
      }
      // 嘗試去掉隊名前綴比對
      const nameOnly = team.nameEn.split(' ').slice(-1)[0];
      mlbTeam = mlbByName.get(normalize(nameOnly));
    }

    if (!mlbTeam) {
      unmatched.push({ apiId: team.apiId, nameEn: team.nameEn });
      continue;
    }

    // 寫入 extra 欄位
    const currentExtra = (team.extra as Record<string, any>) ?? {};
    await prisma.translation.update({
      where: { id: team.id },
      data: {
        extra: {
          ...currentExtra,
          mlbStatsTeamId: mlbTeam.id,
          mlbAbbr: mlbTeam.abbreviation,
        },
      },
    });

    console.log(`✅ ${team.nameEn.padEnd(28)} (API-Sports=${team.apiId}) → MLB ${mlbTeam.id} ${mlbTeam.abbreviation}`);
    matched++;
  }

  console.log(`\n📊 成功對應：${matched}/${apiSportsTeams.length}`);

  if (unmatched.length > 0) {
    console.log(`\n❌ 無法對應的：`);
    for (const u of unmatched) {
      console.log(`   - ${u.apiId}: ${u.nameEn}`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
