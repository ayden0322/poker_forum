/**
 * 裝飾商店「初始商品」seed（go-live 鋪貨用，冪等）。
 * 單一來源：頭像裝飾(FRAME=右下角徽章PNG / 王冠) + 勳章(BADGE=lucide) + 稱號(TITLE) + 頭像特效(EFFECT=去背循環WebM)。
 *
 * 冪等策略：
 *   - create：第一次鋪貨設定全部欄位（含價格/上下架）。
 *   - update：只校正「catalog 視覺欄位」(name/type/rarity/assetUrl/iconKey/description/sortOrder)，
 *             不覆寫 priceG/enabled/purchasable —— 那些是後台可調的營運欄位。
 *
 * 前提：schema 已 db push（CosmeticType / EquipSlot 含 EFFECT）。
 * 資產：FRAME 的 *.png 與 EFFECT 的 *.webm 需一併部署到 apps/web/public/cosmetics/。
 * 跑法（packages/database）：pnpm tsx prisma/seed-cosmetics.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Item = {
  id: string; type: 'FRAME' | 'BADGE' | 'TITLE' | 'EFFECT'; name: string;
  rarity: 'COMMON' | 'RARE' | 'LEGENDARY'; priceG: number;
  iconKey?: string | null; assetUrl?: string | null; description?: string | null; sortOrder: number;
};

const ITEMS: Item[] = [
  // 頭像裝飾（右下角徽章 / 王冠；assetUrl=PNG）
  { id: 'seed_frame_common', type: 'FRAME', name: '守護盾徽', rarity: 'COMMON',    priceG: 50,  assetUrl: '/cosmetics/shield-emblem.png', description: '青綠水晶盾形徽章', sortOrder: 1 },
  { id: 'seed_frame_rare',   type: 'FRAME', name: '疾風之翼', rarity: 'RARE',      priceG: 150, assetUrl: '/cosmetics/wings-emblem.png',  description: '青藍水晶翼徽',     sortOrder: 2 },
  { id: 'seed_frame_legend', type: 'FRAME', name: '桂冠榮耀', rarity: 'LEGENDARY', priceG: 300, assetUrl: '/cosmetics/laurel-emblem.png', description: '金星桂冠徽',       sortOrder: 3 },
  { id: 'seed_frame_crown',  type: 'FRAME', name: '王者之冠', rarity: 'LEGENDARY', priceG: 500, assetUrl: '/cosmetics/crown-gold.png',    description: '黃金王冠（戴頭頂）', sortOrder: 4 },
  // 勳章（lucide iconKey）
  { id: 'seed_badge_post',    type: 'BADGE', name: '初次發文', rarity: 'COMMON',    priceG: 50,  iconKey: 'pencil-line',    sortOrder: 5 },
  { id: 'seed_badge_reply',   type: 'BADGE', name: '留言達人', rarity: 'COMMON',    priceG: 50,  iconKey: 'message-square', sortOrder: 6 },
  { id: 'seed_badge_login',   type: 'BADGE', name: '連續登入', rarity: 'RARE',      priceG: 150, iconKey: 'flame',          sortOrder: 7 },
  { id: 'seed_badge_predict', type: 'BADGE', name: '神準預測', rarity: 'RARE',      priceG: 150, iconKey: 'target',         sortOrder: 8 },
  { id: 'seed_badge_popular', type: 'BADGE', name: '人氣作者', rarity: 'LEGENDARY', priceG: 300, iconKey: 'crown',          sortOrder: 9 },
  { id: 'seed_badge_elder',   type: 'BADGE', name: '開站元老', rarity: 'LEGENDARY', priceG: 300, iconKey: 'gem',            sortOrder: 10 },
  // 稱號（有色文字）
  { id: 'seed_title_predictor', type: 'TITLE', name: '本週預測王', rarity: 'LEGENDARY', priceG: 300, description: '本週預測排行第一', sortOrder: 11 },
  // 頭像特效（獨立槽；assetUrl=video:<name> → public/cosmetics/<name>.webm）
  { id: 'seed_fx_flame',    type: 'EFFECT', name: '烈焰風暴',   rarity: 'RARE',      priceG: 180, assetUrl: 'video:fx-firevortex', description: '火焰旋渦纏繞、餘燼飛散', sortOrder: 20 },
  { id: 'seed_fx_sakura',   type: 'EFFECT', name: '櫻吹雪',     rarity: 'RARE',      priceG: 180, assetUrl: 'video:fx-sakura',     description: '櫻花瓣隨風繞球飄落',   sortOrder: 21 },
  { id: 'seed_fx_champion', type: 'EFFECT', name: '賽亞人光輝', rarity: 'LEGENDARY', priceG: 300, assetUrl: 'video:fx-aura',       description: '金色能量氣場、藍電',   sortOrder: 22 },
  { id: 'seed_fx_orbit',    type: 'EFFECT', name: '星環環繞',   rarity: 'LEGENDARY', priceG: 320, assetUrl: 'video:fx-orbit',      description: '星辰彗星3D交錯繞球',   sortOrder: 23 },
  { id: 'seed_fx_thunder',  type: 'EFFECT', name: '雷霆',       rarity: 'LEGENDARY', priceG: 320, assetUrl: 'video:fx-thunder',    description: '閃電弧3D繞球、頻閃',   sortOrder: 24 },
];

async function main() {
  for (const it of ITEMS) {
    const catalog = {
      type: it.type as never,
      name: it.name,
      rarity: it.rarity as never,
      assetUrl: it.assetUrl ?? null,
      iconKey: it.iconKey ?? null,
      description: it.description ?? null,
      sortOrder: it.sortOrder,
    };
    await prisma.cosmeticItem.upsert({
      where: { id: it.id },
      update: catalog, // 校正視覺/分類；不動 priceG/enabled/purchasable（後台營運欄位）
      create: { id: it.id, ...catalog, priceG: it.priceG, purchasable: true, enabled: true },
    });
  }
  console.log(`裝飾初始商品 seed 完成：${ITEMS.length} 件（FRAME/BADGE/TITLE/EFFECT）`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
