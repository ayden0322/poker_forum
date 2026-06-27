/**
 * 一次性：只對「籃球分類 + 籃球板塊」做 upsert（不動其他運動板塊，避免覆寫正式站手改值）。
 * 用法：DATABASE_URL=<prod> tsx prisma/seed-basketball-prod.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const basketballBoards = [
  { name: 'NBA', slug: 'nba', icon: '🇺🇸', description: '美國職業籃球聯賽', sortOrder: 1 },
  { name: 'FIBA 世界盃資格賽', slug: 'fiba-wc-qualifiers', icon: '🌍', description: 'FIBA 籃球世界盃 2027 資格賽（國家隊）', sortOrder: 12 },
  { name: 'P.League+', slug: 'p-league-plus', icon: '🇹🇼', description: '台灣職業籃球聯盟 P.League+（含賠率）', sortOrder: 2 },
  { name: 'TPBL', slug: 'tpbl', icon: '🇹🇼', description: '台灣職業籃球大聯盟（官方數據源）', sortOrder: 3 },
  { name: 'SBL 超籃', slug: 'sbl', icon: '🇹🇼', description: '台灣超級籃球聯賽', sortOrder: 4 },
  { name: 'CBA 中國職籃', slug: 'cba', icon: '🇨🇳', description: '中國男子職業籃球聯賽', sortOrder: 5 },
  { name: 'B.League 日本職籃', slug: 'b-league', icon: '🇯🇵', description: '日本 B.League 職業籃球聯賽', sortOrder: 6 },
  { name: 'KBL 韓國職籃', slug: 'kbl', icon: '🇰🇷', description: '韓國籃球聯賽 KBL', sortOrder: 7 },
  { name: '東亞超級聯賽', slug: 'easl', icon: '🌏', description: 'East Asia Super League 跨國職籃賽事', sortOrder: 8 },
  { name: 'VBA 越南職籃', slug: 'vba', icon: '🇻🇳', description: '越南職業籃球聯賽（含賠率）', sortOrder: 9 },
  { name: 'NBL 印尼職籃', slug: 'indonesia-nbl', icon: '🇮🇩', description: '印尼國家籃球聯賽（含賠率）', sortOrder: 10 },
  { name: 'NBL 澳洲職籃', slug: 'australia-nbl', icon: '🇦🇺', description: '澳洲國家籃球聯賽', sortOrder: 11 },
  { name: 'PBA 菲律賓職籃', slug: 'pba', icon: '🇵🇭', description: '菲律賓職業籃球協會', sortOrder: 12 },
  { name: 'Euroleague', slug: 'euroleague', icon: '🇪🇺', description: '歐洲籃球冠軍聯賽', sortOrder: 13 },
  { name: 'EuroCup', slug: 'eurocup', icon: '🇪🇺', description: '歐洲籃球次級聯賽', sortOrder: 14 },
  { name: 'ABA 亞得里亞海聯賽', slug: 'aba-league', icon: '🇪🇺', description: '亞得里亞海籃球聯賽（含賠率）', sortOrder: 15 },
  { name: 'ACB 西班牙籃球', slug: 'spain-acb', icon: '🇪🇸', description: '西班牙 ACB 籃球聯賽（含賠率）', sortOrder: 16 },
  { name: 'LNB 法國籃球', slug: 'france-lnb', icon: '🇫🇷', description: '法國 LNB 籃球聯賽（含賠率）', sortOrder: 17 },
  { name: 'Lega A 義大利籃球', slug: 'italy-lega-a', icon: '🇮🇹', description: '義大利 Lega A 籃球聯賽（含賠率）', sortOrder: 18 },
  { name: 'BBL 德國籃球', slug: 'germany-bbl', icon: '🇩🇪', description: '德國 BBL 籃球聯賽（含賠率）', sortOrder: 19 },
  { name: '希臘籃球聯賽', slug: 'greece-basket-league', icon: '🇬🇷', description: '希臘籃球聯賽（含賠率）', sortOrder: 20 },
  { name: '土耳其籃球超級聯賽', slug: 'turkey-super-ligi', icon: '🇹🇷', description: '土耳其籃球超級聯賽（含賠率）', sortOrder: 21 },
  { name: 'LKL 立陶宛籃球', slug: 'lithuania-lkl', icon: '🇱🇹', description: '立陶宛 LKL 籃球聯賽（含賠率）', sortOrder: 22 },
  { name: '波蘭籃球聯賽', slug: 'poland-tbl', icon: '🇵🇱', description: '波蘭籃球聯賽（含賠率）', sortOrder: 23 },
  { name: '其他籃球', slug: 'other-basketball', icon: '🏀', description: '國際賽、亞洲盃等籃球討論', sortOrder: 99 },
];

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  console.log('目標 DB host:', url.replace(/:[^:@]*@/, ':***@').replace(/^.*@/, '@'));

  const basketball = await prisma.category.upsert({
    where: { slug: 'basketball' },
    update: {},
    create: { name: '籃球', slug: 'basketball', sortOrder: 1 },
  });
  console.log('籃球分類 id:', basketball.id);

  let created = 0;
  let updated = 0;
  for (const board of basketballBoards) {
    const existing = await prisma.board.findUnique({ where: { slug: board.slug } });
    await prisma.board.upsert({
      where: { slug: board.slug },
      update: { name: board.name, icon: board.icon, description: board.description, sortOrder: board.sortOrder, categoryId: basketball.id },
      create: { ...board, categoryId: basketball.id },
    });
    if (existing) updated++; else created++;
  }
  console.log(`完成：新建 ${created}、更新 ${updated} 個籃球板塊`);

  // 刪除已併入 TPBL 的 t1-league 孤兒板塊（僅在 0 貼文時）
  const t1 = await prisma.board.findUnique({ where: { slug: 't1-league' }, include: { _count: { select: { posts: true } } } });
  if (t1) {
    if (t1._count.posts === 0) {
      await prisma.board.delete({ where: { slug: 't1-league' } });
      console.log('已刪除 t1-league 孤兒板塊（0 貼文）');
    } else {
      console.log(`⚠️ t1-league 有 ${t1._count.posts} 篇貼文，未刪除（保留）`);
    }
  } else {
    console.log('t1-league 不存在，略過');
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
