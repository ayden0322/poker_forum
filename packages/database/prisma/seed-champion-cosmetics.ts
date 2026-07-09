// 週冠軍裝飾品項 seed（TITLE 稱號 + BADGE 勳章，各 2）
// 用法：DATABASE_URL=... tsx prisma/seed-champion-cosmetics.ts
// 勳章視覺：設計定案走傳說 PNG 金幣（assetUrl）；PNG 生成前先掛 lucide 佔位（iconKey），
//          Codex 生好 champion-*-medallion.png 後把 assetUrl 補上、iconKey 清掉即可。

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// [name, type, iconKey 佔位, assetUrl（PNG 好了填）]
const ITEMS: Array<{ name: string; type: 'TITLE' | 'BADGE'; iconKey: string | null; assetUrl: string | null; description: string }> = [
  { name: '本週獲利王', type: 'TITLE', iconKey: null, assetUrl: null, description: '本週獲利榜冠軍限定稱號（掛一週）' },
  { name: '本週神算子', type: 'TITLE', iconKey: null, assetUrl: null, description: '本週勝率榜冠軍限定稱號（掛一週）' },
  { name: '獲利榜冠軍', type: 'BADGE', iconKey: 'trophy', assetUrl: null, description: '獲利榜週冠軍紀念勳章' },
  { name: '勝率榜冠軍', type: 'BADGE', iconKey: 'target', assetUrl: null, description: '勝率榜週冠軍紀念勳章' },
];

async function main() {
  for (const it of ITEMS) {
    const existing = await prisma.cosmeticItem.findFirst({ where: { name: it.name, type: it.type } });
    const data = {
      type: it.type,
      name: it.name,
      description: it.description,
      iconKey: it.iconKey,
      assetUrl: it.assetUrl,
      rarity: 'LEGENDARY' as const, // 傳說金
      priceG: null, // 非販售，只能靠奪冠獲得
      purchasable: false,
      source: undefined as never, // 品項本身無 source（source 在 UserCosmetic）
    };
    delete (data as Record<string, unknown>).source;
    if (existing) {
      await prisma.cosmeticItem.update({ where: { id: existing.id }, data });
      console.log(`更新：${it.name}（${it.type}）`);
    } else {
      await prisma.cosmeticItem.create({ data });
      console.log(`建立：${it.name}（${it.type}）`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
