/**
 * 國際友誼賽球隊名稱翻譯
 *
 * 調用後台翻譯系統（TranslationService，與 translation.cron 同一支 Claude 流程），
 * 把 friendly_teams 的英文國家隊名翻成台灣常用中文譯名，存進 Translation 表後回寫 friendlyTeam.nameZh。
 *
 * entityType 用 'country'（規則：國家名稱使用台灣常用譯名 → 巴西 / 德國 / 法國）。
 *
 * 用法：
 *   ./packages/database/node_modules/.bin/tsx apps/api/scripts/translate-friendly-teams.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient } from '@betting-forum/database';
import { ConfigService } from '@nestjs/config';
import { TranslationService, TranslatableEntity } from '../src/translation/translation.service';

const prisma = new PrismaClient();
const config = new ConfigService();
const translation = new TranslationService(config as any, prisma as any);

const SPORT = 'football';
const ENTITY = 'country' as const;

async function main() {
  const teams = await prisma.friendlyTeam.findMany({
    select: { id: true, apiTeamId: true, nameEn: true, nameZh: true },
  });
  console.log(`📋 友誼賽球隊共 ${teams.length} 隊，其中未翻譯 ${teams.filter((t) => !t.nameZh).length} 隊`);

  const entities: TranslatableEntity[] = teams.map((t) => ({
    entityType: ENTITY,
    apiId: t.apiTeamId,
    nameEn: t.nameEn,
    sport: SPORT,
  }));

  // 1. 只翻 Translation 表還沒有的（跨聯賽快取重用）
  const missing = await translation.findMissing(entities);
  console.log(`🔍 需呼叫 Claude 翻譯：${missing.length} 隊`);

  if (missing.length > 0) {
    const n = await translation.translateBatch(missing, { triggeredBy: 'manual' });
    console.log(`🤖 Claude 翻譯完成：${n} 隊`);
  }

  // 2. 從 Translation 表讀回，回寫 friendlyTeam.nameZh
  const map = await translation.getTranslations(
    ENTITY,
    SPORT,
    teams.map((t) => t.apiTeamId),
  );

  let updated = 0;
  let unresolved = 0;
  for (const t of teams) {
    const tr = map.get(t.apiTeamId);
    if (tr?.nameZhTw && tr.nameZhTw !== t.nameZh) {
      await prisma.friendlyTeam.update({ where: { id: t.id }, data: { nameZh: tr.nameZhTw } });
      updated++;
    } else if (!tr?.nameZhTw) {
      unresolved++;
    }
  }

  console.log(`✅ 回寫 friendlyTeam.nameZh：${updated} 隊更新${unresolved ? `，${unresolved} 隊仍無譯名` : ''}`);

  // 抽樣顯示
  const sample = await prisma.friendlyTeam.findMany({
    where: { nameZh: { not: null } },
    take: 10,
    orderBy: { isMarquee: 'desc' },
    select: { nameZh: true, nameEn: true },
  });
  console.log('   抽樣：', sample.map((s) => `${s.nameZh}（${s.nameEn}）`).join('、'));
}

main()
  .catch((e) => {
    console.error('❌ 翻譯失敗:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
