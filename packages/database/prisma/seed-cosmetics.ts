/**
 * 裝飾商店「起始素材」seed（Route A：框=CSS環 / 勳章=lucide / 稱號=有色文字，視覺由 rarity 驅動）。
 * 冪等：用固定 id upsert，可重複跑、可用於 go-live 鋪初始商品。
 *
 * 跑法（packages/database）：pnpm tsx prisma/seed-cosmetics.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ITEMS = [
  { id: 'seed_frame_common', type: 'FRAME', name: '新手環', rarity: 'COMMON', priceG: 50, iconKey: null, sortOrder: 1 },
  { id: 'seed_frame_rare', type: 'FRAME', name: '老手環', rarity: 'RARE', priceG: 150, iconKey: null, sortOrder: 2 },
  { id: 'seed_frame_legend', type: 'FRAME', name: '傳說邊框', rarity: 'LEGENDARY', priceG: 300, iconKey: null, sortOrder: 3 },
  { id: 'seed_badge_post', type: 'BADGE', name: '初次發文', rarity: 'COMMON', priceG: 50, iconKey: 'pencil-line', sortOrder: 4 },
  { id: 'seed_badge_reply', type: 'BADGE', name: '留言達人', rarity: 'COMMON', priceG: 50, iconKey: 'message-square', sortOrder: 5 },
  { id: 'seed_badge_login', type: 'BADGE', name: '連續登入', rarity: 'RARE', priceG: 150, iconKey: 'flame', sortOrder: 6 },
  { id: 'seed_badge_predict', type: 'BADGE', name: '神準預測', rarity: 'RARE', priceG: 150, iconKey: 'target', sortOrder: 7 },
  { id: 'seed_badge_popular', type: 'BADGE', name: '人氣作者', rarity: 'LEGENDARY', priceG: 300, iconKey: 'crown', sortOrder: 8 },
  { id: 'seed_badge_elder', type: 'BADGE', name: '開站元老', rarity: 'LEGENDARY', priceG: 300, iconKey: 'gem', sortOrder: 9 },
] as const;

async function main() {
  for (const it of ITEMS) {
    await prisma.cosmeticItem.upsert({
      where: { id: it.id },
      // 只補不蓋：已存在就不覆寫後台可能改過的價格/上下架
      update: {},
      create: {
        id: it.id,
        type: it.type as never,
        name: it.name,
        rarity: it.rarity as never,
        priceG: it.priceG,
        iconKey: it.iconKey,
        sortOrder: it.sortOrder,
        purchasable: true,
        enabled: true,
      },
    });
  }
  console.log(`裝飾起始素材 seed 完成：${ITEMS.length} 件`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
