import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('開始 Seed 資料...');

  // 建立分類
  const sports = await prisma.category.upsert({
    where: { slug: 'sports' },
    update: {},
    create: { name: '體育賽事', slug: 'sports', sortOrder: 1 },
  });

  const lottery = await prisma.category.upsert({
    where: { slug: 'lottery' },
    update: {},
    create: { name: '台灣彩票', slug: 'lottery', sortOrder: 2 },
  });

  const general = await prisma.category.upsert({
    where: { slug: 'general' },
    update: {},
    create: { name: '綜合', slug: 'general', sortOrder: 3 },
  });

  // 體育賽事看板
  const sportsBoards = [
    { name: '棒球', slug: 'baseball', description: 'MLB、中職、日職、韓職等棒球討論', sortOrder: 1 },
    { name: '籃球', slug: 'basketball', description: 'NBA、SBL、歐籃等籃球討論', sortOrder: 2 },
    { name: '足球', slug: 'soccer', description: '英超、西甲、歐冠、世界盃等足球討論', sortOrder: 3 },
    { name: '其他運動', slug: 'other-sports', description: '冰球、網球、電競、賽馬等討論', sortOrder: 4 },
  ];

  for (const board of sportsBoards) {
    await prisma.board.upsert({
      where: { slug: board.slug },
      update: {},
      create: { ...board, categoryId: sports.id },
    });
  }

  // 台灣彩票看板
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

  // 綜合看板
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

  // 建立常用標籤
  const tags = [
    { name: '分析', slug: 'analysis' },
    { name: '曬單', slug: 'show-ticket' },
    { name: '求推薦', slug: 'recommend' },
    { name: '開獎', slug: 'draw-result' },
    { name: '心得', slug: 'review' },
    { name: '教學', slug: 'tutorial' },
    { name: '討論', slug: 'discussion' },
  ];

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { slug: tag.slug },
      update: {},
      create: tag,
    });
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
