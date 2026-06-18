/**
 * 唯讀稽核：找出「貼文身上的標籤，不屬於該貼文看板分類允許集合」的歷史關聯。
 *
 * 背景：舊資料時期全站共用同一套標籤，運動板貼文可能帶了彩券標籤（曬單/求推薦/開獎），反之亦然。
 * 本腳本「只讀不寫」，產出對照清單與數量，供人工決定要保留 / 轉換 / 隱藏 / 清除。
 *
 * 特意只讀 tag.slug 與 category.slug（不依賴新加的 scope/type 欄位），
 * 因此可在 migration 之前就先對正式 DB 跑一次盤點。
 *
 * 用法：
 *   DATABASE_URL="<目標DB>" npx tsx apps/api/scripts/audit-tag-mismatch.ts
 */
import { PrismaClient } from '@betting-forum/database';

const prisma = new PrismaClient();

// 標籤 slug → 適用範圍（與 seed.ts 同一份定義）
const TAG_SCOPE: Record<string, 'GLOBAL' | 'SPORTS' | 'LOTTERY'> = {
  analysis: 'GLOBAL', review: 'GLOBAL', discussion: 'GLOBAL', tutorial: 'GLOBAL',
  'match-thread': 'SPORTS', prediction: 'SPORTS', player: 'SPORTS', lineup: 'SPORTS',
  'show-ticket': 'LOTTERY', recommend: 'LOTTERY', 'draw-result': 'LOTTERY',
};

// 分類 slug → 型別
const CATEGORY_TYPE: Record<string, 'SPORTS' | 'LOTTERY' | 'GENERAL'> = {
  basketball: 'SPORTS', soccer: 'SPORTS', baseball: 'SPORTS', 'other-sports': 'SPORTS',
  lottery: 'LOTTERY', general: 'GENERAL',
};

/** 標籤在該分類是否合法：GLOBAL 一律可；其餘需 scope 與分類 type 相符 */
function isAllowed(tagSlug: string, categorySlug: string): boolean {
  const scope = TAG_SCOPE[tagSlug];
  if (!scope) return true; // 未知標籤（不在新清單內）先不判定為錯，另外列出
  if (scope === 'GLOBAL') return true;
  return scope === CATEGORY_TYPE[categorySlug];
}

async function main() {
  const postTags = await prisma.postTag.findMany({
    include: {
      tag: { select: { slug: true, name: true } },
      post: {
        select: {
          id: true, title: true, status: true,
          board: { select: { slug: true, name: true, category: { select: { slug: true, name: true } } } },
        },
      },
    },
  });

  type Row = { categorySlug: string; categoryName: string; tagSlug: string; tagName: string; postId: string; postTitle: string; boardName: string; status: string };
  const mismatches: Row[] = [];
  const unknownTags = new Set<string>();

  for (const pt of postTags) {
    const cat = pt.post.board.category;
    if (!TAG_SCOPE[pt.tag.slug]) unknownTags.add(pt.tag.slug);
    if (!isAllowed(pt.tag.slug, cat.slug)) {
      mismatches.push({
        categorySlug: cat.slug, categoryName: cat.name,
        tagSlug: pt.tag.slug, tagName: pt.tag.name,
        postId: pt.post.id, postTitle: pt.post.title,
        boardName: pt.post.board.name, status: pt.post.status,
      });
    }
  }

  console.log('===== 標籤錯置稽核（唯讀）=====');
  console.log(`PostTag 關聯總數：${postTags.length}`);
  console.log(`錯置關聯數：${mismatches.length}`);
  console.log(`未知標籤 slug（不在新 11 標籤清單內，未判定）：${[...unknownTags].join(', ') || '無'}`);
  console.log('');

  // 依「分類 × 標籤」彙總
  const byGroup = new Map<string, { count: number; samples: string[] }>();
  for (const m of mismatches) {
    const key = `[${m.categoryName}] 出現 #${m.tagName} (${m.tagSlug})`;
    const g = byGroup.get(key) ?? { count: 0, samples: [] };
    g.count += 1;
    if (g.samples.length < 3) g.samples.push(`${m.boardName}｜${m.postTitle.slice(0, 30)} (${m.status})`);
    byGroup.set(key, g);
  }

  console.log('===== 依「分類 × 標籤」彙總（含最多 3 筆範例）=====');
  for (const [key, g] of [...byGroup.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`\n${key} — ${g.count} 筆`);
    g.samples.forEach((s) => console.log(`   · ${s}`));
  }

  console.log('\n（本腳本未修改任何資料）');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
