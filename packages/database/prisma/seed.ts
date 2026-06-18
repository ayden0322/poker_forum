import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('開始 Seed 資料...');

  // ===== 分類 =====
  const basketball = await prisma.category.upsert({
    where: { slug: 'basketball' },
    update: { name: '籃球', sortOrder: 1, type: 'SPORTS' },
    create: { name: '籃球', slug: 'basketball', sortOrder: 1, type: 'SPORTS' },
  });

  const soccer = await prisma.category.upsert({
    where: { slug: 'soccer' },
    update: { name: '足球', sortOrder: 2, type: 'SPORTS' },
    create: { name: '足球', slug: 'soccer', sortOrder: 2, type: 'SPORTS' },
  });

  const baseball = await prisma.category.upsert({
    where: { slug: 'baseball' },
    update: { name: '棒球', sortOrder: 3, type: 'SPORTS' },
    create: { name: '棒球', slug: 'baseball', sortOrder: 3, type: 'SPORTS' },
  });

  const otherSports = await prisma.category.upsert({
    where: { slug: 'other-sports' },
    update: { name: '其他運動', sortOrder: 4, type: 'SPORTS' },
    create: { name: '其他運動', slug: 'other-sports', sortOrder: 4, type: 'SPORTS' },
  });

  const lottery = await prisma.category.upsert({
    where: { slug: 'lottery' },
    update: { type: 'LOTTERY' },
    create: { name: '台灣彩票', slug: 'lottery', sortOrder: 5, type: 'LOTTERY' },
  });

  const general = await prisma.category.upsert({
    where: { slug: 'general' },
    update: { type: 'GENERAL' },
    create: { name: '綜合', slug: 'general', sortOrder: 6, type: 'GENERAL' },
  });

  // ===== 籃球看板 =====
  // ⚠️ slug / 名稱對齊 apps/api LEAGUE_CONFIG（能力驅動板塊系統）。名稱帶 disambiguator 避免縮寫撞名（CBA/SBL…）。
  // t1-league 已移除（T1 併入 TPBL、API 無現役資料）；舊 DB 若有 t1-league 板塊為孤兒、已 noindex，待無貼文時手動清除。
  const basketballBoards = [
    { name: 'NBA', slug: 'nba', icon: '🇺🇸', description: '美國職業籃球聯賽', sortOrder: 1 },
    // 國際賽
    { name: 'FIBA 世界盃資格賽', slug: 'fiba-wc-qualifiers', icon: '🌍', description: 'FIBA 籃球世界盃 2027 資格賽（國家隊）', sortOrder: 12 },
    // 台灣
    { name: 'P.League+', slug: 'p-league-plus', icon: '🇹🇼', description: '台灣職業籃球聯盟 P.League+（含賠率）', sortOrder: 2 },
    { name: 'TPBL', slug: 'tpbl', icon: '🇹🇼', description: '台灣職業籃球大聯盟（官方數據源）', sortOrder: 3 },
    { name: 'SBL 超籃', slug: 'sbl', icon: '🇹🇼', description: '台灣超級籃球聯賽', sortOrder: 4 },
    // 東亞
    { name: 'CBA 中國職籃', slug: 'cba', icon: '🇨🇳', description: '中國男子職業籃球聯賽', sortOrder: 5 },
    { name: 'B.League 日本職籃', slug: 'b-league', icon: '🇯🇵', description: '日本 B.League 職業籃球聯賽', sortOrder: 6 },
    { name: 'KBL 韓國職籃', slug: 'kbl', icon: '🇰🇷', description: '韓國籃球聯賽 KBL', sortOrder: 7 },
    { name: '東亞超級聯賽', slug: 'easl', icon: '🌏', description: 'East Asia Super League 跨國職籃賽事', sortOrder: 8 },
    // 東南亞 / 大洋洲
    { name: 'VBA 越南職籃', slug: 'vba', icon: '🇻🇳', description: '越南職業籃球聯賽（含賠率）', sortOrder: 9 },
    { name: 'NBL 印尼職籃', slug: 'indonesia-nbl', icon: '🇮🇩', description: '印尼國家籃球聯賽（含賠率）', sortOrder: 10 },
    { name: 'NBL 澳洲職籃', slug: 'australia-nbl', icon: '🇦🇺', description: '澳洲國家籃球聯賽', sortOrder: 11 },
    { name: 'PBA 菲律賓職籃', slug: 'pba', icon: '🇵🇭', description: '菲律賓職業籃球協會', sortOrder: 12 },
    // 歐洲
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

  for (const board of basketballBoards) {
    await prisma.board.upsert({
      where: { slug: board.slug },
      update: { name: board.name, icon: board.icon, description: board.description, sortOrder: board.sortOrder, categoryId: basketball.id },
      create: { ...board, categoryId: basketball.id },
    });
  }

  // ===== 足球看板 =====
  const soccerBoards = [
    { name: '英超', slug: 'epl', icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', description: '英格蘭超級聯賽', sortOrder: 1 },
    { name: '西甲', slug: 'la-liga', icon: '🇪🇸', description: '西班牙甲級聯賽', sortOrder: 2 },
    { name: '義甲', slug: 'serie-a', icon: '🇮🇹', description: '義大利甲級聯賽', sortOrder: 3 },
    { name: '德甲', slug: 'bundesliga', icon: '🇩🇪', description: '德國甲級聯賽', sortOrder: 4 },
    { name: '法甲', slug: 'ligue-1', icon: '🇫🇷', description: '法國甲級聯賽', sortOrder: 5 },
    { name: '歐冠', slug: 'ucl', icon: '🏆', description: '歐洲冠軍聯賽', sortOrder: 6 },
    { name: 'J 聯賽', slug: 'j-league', icon: '🇯🇵', description: '日本 J1 聯賽', sortOrder: 7 },
    { name: '中超', slug: 'csl', icon: '🇨🇳', description: '中國足球超級聯賽', sortOrder: 8 },
    { name: '世界盃', slug: 'world-cup', icon: '🌍', description: 'FIFA 世界盃', sortOrder: 9 },
    { name: '國際友誼賽', slug: 'friendlies', icon: '🤝', description: '國際足球友誼賽（國家隊熱身賽）', sortOrder: 10 },
    { name: '其他足球', slug: 'other-soccer', icon: '⚽', description: 'K 聯賽、東南亞足球等討論', sortOrder: 11 },
  ];

  for (const board of soccerBoards) {
    await prisma.board.upsert({
      where: { slug: board.slug },
      update: { name: board.name, icon: board.icon, description: board.description, sortOrder: board.sortOrder, categoryId: soccer.id },
      create: { ...board, categoryId: soccer.id },
    });
  }

  // ===== 棒球看板 =====
  const baseballBoards = [
    { name: 'MLB', slug: 'mlb', icon: '🇺🇸', description: '美國職棒大聯盟', sortOrder: 1 },
    { name: '中華職棒', slug: 'cpbl', icon: '🇹🇼', description: '台灣中華職業棒球大聯盟', sortOrder: 2 },
    { name: '日本職棒', slug: 'npb', icon: '🇯🇵', description: '日本野球機構 NPB', sortOrder: 3 },
    { name: '韓國職棒', slug: 'kbo', icon: '🇰🇷', description: '韓國棒球委員會 KBO', sortOrder: 4 },
    { name: '其他棒球', slug: 'other-baseball', icon: '⚾', description: '國際賽、冬季聯盟等棒球討論', sortOrder: 5 },
  ];

  for (const board of baseballBoards) {
    await prisma.board.upsert({
      where: { slug: board.slug },
      update: { name: board.name, icon: board.icon, description: board.description, sortOrder: board.sortOrder, categoryId: baseball.id },
      create: { ...board, categoryId: baseball.id },
    });
  }

  // ===== 其他運動看板 =====
  const otherSportsBoards = [
    { name: '網球', slug: 'tennis', icon: '🎾', description: 'ATP / WTA 網球討論', sortOrder: 1 },
    { name: '冰球', slug: 'hockey', icon: '🏒', description: 'NHL 冰球討論', sortOrder: 2 },
    { name: '電競', slug: 'esports', icon: '🎮', description: 'LOL、CS、Valorant 等電競討論', sortOrder: 3 },
    { name: '格鬥', slug: 'mma', icon: '🥊', description: 'UFC、拳擊等格鬥討論', sortOrder: 4 },
    { name: '賽馬', slug: 'horse-racing', icon: '🏇', description: '賽馬討論', sortOrder: 5 },
  ];

  for (const board of otherSportsBoards) {
    await prisma.board.upsert({
      where: { slug: board.slug },
      update: { name: board.name, icon: board.icon, description: board.description, sortOrder: board.sortOrder, categoryId: otherSports.id },
      create: { ...board, categoryId: otherSports.id },
    });
  }

  // ===== 台灣彩票看板（維持原本） =====
  const lotteryBoards = [
    { name: '大樂透', slug: 'lotto649', description: '大樂透開獎號碼、選號分析討論', sortOrder: 1 },
    { name: '威力彩', slug: 'super-lotto', description: '威力彩開獎號碼、選號分析討論', sortOrder: 2 },
    { name: '今彩539', slug: 'daily-cash', description: '今彩539開獎號碼、選號分析討論', sortOrder: 3 },
    { name: '雙贏彩', slug: 'lotto1224', description: '雙贏彩討論', sortOrder: 4 },
    { name: '3星彩 / 4星彩', slug: 'star-lotto', description: '3星彩、4星彩討論', sortOrder: 5 },
    { name: '刮刮樂', slug: 'scratch-card', description: '刮刮樂心得、中獎分享', sortOrder: 6 },
    { name: '運彩', slug: 'sports-lottery', description: '台灣運動彩券討論', sortOrder: 7 },
  ];

  for (const board of lotteryBoards) {
    await prisma.board.upsert({
      where: { slug: board.slug },
      update: {},
      create: { ...board, categoryId: lottery.id },
    });
  }

  // ===== 綜合看板（維持原本） =====
  const generalBoards = [
    { name: '閒聊灌水', slug: 'chat', description: '輕鬆聊天、日常話題', sortOrder: 1 },
    { name: '新手教學', slug: 'tutorial', description: '新手入門教學、規則說明', sortOrder: 2 },
    { name: '心得分享', slug: 'share', description: '曬單、戰績分享、心得', sortOrder: 3 },
    { name: '站務公告', slug: 'announcement', description: '站務公告、規則更新', sortOrder: 4 },
  ];

  for (const board of generalBoards) {
    await prisma.board.upsert({
      where: { slug: board.slug },
      update: {},
      create: { ...board, categoryId: general.id },
    });
  }

  // ===== 常用標籤（scope 決定哪些分類看板能用）=====
  // GLOBAL = 所有看板通用；SPORTS = 體育四分類共用；LOTTERY = 台灣彩票專用。
  // SPORTS 四個（戰報/預測/球員/陣容）沿用前端 WorldCupTagFilter 原本寫死、但 DB 不存在的 slug，
  // 一次補上資料層，讓原本的「死鈕」變成跨運動板真正可用、可篩選的標籤。
  const tags: { name: string; slug: string; scope: 'GLOBAL' | 'SPORTS' | 'LOTTERY'; sortOrder: number }[] = [
    // 通用層
    { name: '分析', slug: 'analysis', scope: 'GLOBAL', sortOrder: 1 },
    { name: '心得', slug: 'review', scope: 'GLOBAL', sortOrder: 2 },
    { name: '討論', slug: 'discussion', scope: 'GLOBAL', sortOrder: 3 },
    { name: '教學', slug: 'tutorial', scope: 'GLOBAL', sortOrder: 4 },
    // 運動共用層
    { name: '戰報', slug: 'match-thread', scope: 'SPORTS', sortOrder: 1 },
    { name: '預測', slug: 'prediction', scope: 'SPORTS', sortOrder: 2 },
    { name: '球員', slug: 'player', scope: 'SPORTS', sortOrder: 3 },
    { name: '陣容', slug: 'lineup', scope: 'SPORTS', sortOrder: 4 },
    // 彩券層
    { name: '曬單', slug: 'show-ticket', scope: 'LOTTERY', sortOrder: 1 },
    { name: '求推薦', slug: 'recommend', scope: 'LOTTERY', sortOrder: 2 },
    { name: '開獎', slug: 'draw-result', scope: 'LOTTERY', sortOrder: 3 },
  ];

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { slug: tag.slug },
      // update scope/sortOrder：既有標籤重新歸位（例如舊的 analysis 預設 GLOBAL）
      update: { name: tag.name, scope: tag.scope, sortOrder: tag.sortOrder },
      create: tag,
    });
  }

  // ===== 清理舊的「體育賽事」分類（如果有舊文章則保留） =====
  const oldSportsCategory = await prisma.category.findUnique({ where: { slug: 'sports' } });
  if (oldSportsCategory) {
    // 將舊板塊的文章數量檢查一下
    const oldBoards = await prisma.board.findMany({
      where: { categoryId: oldSportsCategory.id },
      include: { _count: { select: { posts: true } } },
    });

    for (const ob of oldBoards) {
      if (ob._count.posts === 0) {
        // 沒有文章的舊板塊直接停用
        await prisma.board.update({
          where: { id: ob.id },
          data: { isActive: false },
        });
      }
      // 有文章的保留，之後手動遷移
    }
    console.log(`舊「體育賽事」分類處理完成，${oldBoards.length} 個板塊已檢查`);
  }

  console.log('Seed 完成！');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
