// 榮譽系統品項 seed（2026-07）：冠軍限定稱號 + 加冕徽記 + 成就徽章。
// 全部 purchasable=false（買不到，只能戰績解鎖），由 SeasonService / HonorService 依名稱發放。
// 執行：docker exec -w /app/packages/database betting-forum-api npx prisma db seed  ← 或直接 tsx 本檔
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Seed = {
  type: 'TITLE' | 'BADGE';
  name: string;
  description: string;
  rarity: 'COMMON' | 'RARE' | 'LEGENDARY';
  iconKey?: string;
  assetUrl?: string;
};

// 名稱必須與 season.service.ts / honor.service.ts 內發放用的名稱一致。
const ITEMS: Seed[] = [
  // 冠軍限定稱號（在位期間掛上，expiresAt 到期自動卸冕）
  { type: 'TITLE', name: '本季神算王', description: '本季準度榜冠軍·在位限定', rarity: 'LEGENDARY' },
  { type: 'TITLE', name: '本季獲利王', description: '本季獲利榜冠軍·在位限定', rarity: 'LEGENDARY' },
  { type: 'TITLE', name: '本季人氣王', description: '本季影響力榜冠軍·在位限定', rarity: 'LEGENDARY' },
  // 加冕徽記（冠軍永久紀念）
  { type: 'BADGE', name: '加冕徽記', description: '登頂本季冠軍的加冕封記', rarity: 'LEGENDARY', assetUrl: '/cosmetics/honor-champion-crest.png' },
  // 賽季亞軍/季軍（加冕徽記金屬分階）
  { type: 'BADGE', name: '本季亞軍', description: '本季榜次席', rarity: 'RARE', assetUrl: '/cosmetics/honor-runnerup-silver.png' },
  { type: 'BADGE', name: '本季季軍', description: '本季榜季席', rarity: 'RARE', assetUrl: '/cosmetics/honor-runnerup-bronze.png' },
  // 連勝（火焰·鋼/銀/金分階）
  { type: 'BADGE', name: '五連勝', description: '連續命中 5 場', rarity: 'COMMON', assetUrl: '/cosmetics/honor-streak-steel.png' },
  { type: 'BADGE', name: '十連勝之王', description: '連續命中 10 場', rarity: 'RARE', assetUrl: '/cosmetics/honor-streak-silver.png' },
  { type: 'BADGE', name: '二十連勝', description: '連續命中 20 場', rarity: 'LEGENDARY', assetUrl: '/cosmetics/honor-streak-gold.png' },
  // 命中 / 準度
  { type: 'BADGE', name: '冷門獵人', description: '命中賠率 ≥ 5.0', rarity: 'RARE', assetUrl: '/cosmetics/honor-upset.png' },
  { type: 'BADGE', name: '一戰封神', description: '命中賠率 ≥ 15.0', rarity: 'LEGENDARY', assetUrl: '/cosmetics/honor-legend.png' },
  { type: 'BADGE', name: '神準射手', description: '單月準度 ≥ 70%（≥30 場）', rarity: 'RARE', assetUrl: '/cosmetics/honor-sharpshooter.png' },
  // 帶單 / 影響力（銅/銀/金分階）
  { type: 'BADGE', name: '帶單百人', description: '累計被跟單 100', rarity: 'COMMON', assetUrl: '/cosmetics/honor-influence-bronze.png' },
  { type: 'BADGE', name: '帶單導師', description: '累計被跟單 1,000', rarity: 'RARE', assetUrl: '/cosmetics/honor-influence-silver.png' },
  { type: 'BADGE', name: '影響力王', description: '累計被跟單 10,000', rarity: 'LEGENDARY', assetUrl: '/cosmetics/honor-influence-gold.png' },
  // 資歷
  { type: 'BADGE', name: '開站元老', description: '開站首月加入', rarity: 'RARE', assetUrl: '/cosmetics/honor-veteran.png' },
];

async function main() {
  for (const it of ITEMS) {
    const existing = await prisma.cosmeticItem.findFirst({ where: { name: it.name, type: it.type } });
    const data = {
      type: it.type,
      name: it.name,
      description: it.description,
      rarity: it.rarity,
      iconKey: it.iconKey ?? null,
      assetUrl: it.assetUrl ?? null,
      priceG: null,
      purchasable: false, // 買不到：只能戰績解鎖
    };
    if (existing) {
      await prisma.cosmeticItem.update({ where: { id: existing.id }, data });
      console.log(`更新 ${it.type} ${it.name}`);
    } else {
      await prisma.cosmeticItem.create({ data });
      console.log(`建立 ${it.type} ${it.name}`);
    }
  }
  console.log(`榮譽品項 seed 完成：${ITEMS.length} 項`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
