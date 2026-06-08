/**
 * 國際足球友誼賽 2026 — API-Sports seed
 *
 * 資料來源：v3.football.api-sports.io，league=10（Cup Friendlies，國家隊國際友誼賽），season=2026
 * 一次性把整季 fixtures + teams（含真 logo）抽進 DB。focus 戰（雙方皆強隊）標 isFeatured=true。
 *
 * 用法：
 *   pnpm exec tsx apps/api/scripts/seed-friendlies-from-apisports.ts
 *
 * ⚠️ API_SPORTS_KEY 到期前務必先跑一次，確保整季結果頁有靜態資料可長期當 SEO 內容。
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient } from '@betting-forum/database';
import {
  callFootballApi,
  upsertFixtures,
  FRIENDLIES_LEAGUE_ID,
  FRIENDLIES_SEASON,
  ApiFixture,
} from '../src/sports/friendlies/friendlies.apisports';

const prisma = new PrismaClient();

const API_KEY = process.env.API_SPORTS_KEY ?? '';
if (!API_KEY) throw new Error('API_SPORTS_KEY 未設定');

async function main() {
  console.log(`📥 拉 api-sports 友誼賽賽程（league=${FRIENDLIES_LEAGUE_ID}, season=${FRIENDLIES_SEASON}）...`);
  const fixtures = await callFootballApi<ApiFixture[]>(API_KEY, '/fixtures', {
    league: FRIENDLIES_LEAGUE_ID,
    season: FRIENDLIES_SEASON,
  });
  console.log(`   取得 ${fixtures.length} 場 fixtures`);

  if (!fixtures.length) {
    console.warn('⚠️ api-sports 沒回傳 fixtures，請確認訂閱與 league/season。');
    return;
  }

  console.log('💾 upsert teams + matches（含真 logo、焦點戰標記）...');
  const r = await upsertFixtures(prisma, fixtures);

  const featured = await prisma.friendlyMatch.count({
    where: { season: FRIENDLIES_SEASON, isFeatured: true },
  });
  const teams = await prisma.friendlyTeam.count();

  console.log('✅ 完成');
  console.log(`   比賽：${r.matches} 場（其中焦點戰 ${featured} 場 → 可索引）`);
  console.log(`   球隊：${teams} 隊`);
}

main()
  .catch((e) => {
    console.error('❌ seed 失敗:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
