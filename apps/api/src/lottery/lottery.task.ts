import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { LotteryService, GameType, GAME_CONFIG } from './lottery.service';

@Injectable()
export class LotteryTask {
  private readonly logger = new Logger(LotteryTask.name);

  constructor(
    private readonly lotteryService: LotteryService,
    private readonly prisma: PrismaService,
  ) {}

  /** 每日 21:30 自動抓取開獎結果 */
  @Cron('30 21 * * *')
  async handleDailySync() {
    this.logger.log('開始每日開獎同步...');

    for (const gameType of Object.keys(GAME_CONFIG) as GameType[]) {
      try {
        const newCount = await this.lotteryService.syncResults(gameType);
        if (newCount > 0) {
          this.logger.log(`${GAME_CONFIG[gameType].name}：新增 ${newCount} 筆`);
          await this.autoPost(gameType);
        }
      } catch (err) {
        this.logger.error(`同步 ${GAME_CONFIG[gameType].name} 失敗：${err}`);
      }
    }

    this.logger.log('每日開獎同步完成');
  }

  /** 每 6 小時補抓（確保不漏接） */
  @Cron('0 */6 * * *')
  async handlePeriodicSync() {
    for (const gameType of Object.keys(GAME_CONFIG) as GameType[]) {
      try {
        await this.lotteryService.syncResults(gameType);
      } catch (err) {
        this.logger.error(`定期同步 ${GAME_CONFIG[gameType].name} 失敗：${err}`);
      }
    }
  }

  /** 彩種 → 看板 slug 對應 */
  private readonly gameTypeToBoard: Record<string, string> = {
    LOTTO649: 'lotto649',
    SUPER_LOTTO: 'super-lotto',
    DAILY539: 'daily-cash',
    LOTTO1224: 'lotto1224',
    LOTTO3D: 'star-lotto',
    LOTTO4D: 'star-lotto',
  };

  /** 在對應看板自動發文 */
  private async autoPost(gameType: GameType) {
    // 找到最新結果
    const latest = await this.prisma.lotteryResult.findFirst({
      where: { gameType },
      orderBy: { drawDate: 'desc' },
    });
    if (!latest) return;

    // 找到對應看板
    const boardSlug = this.gameTypeToBoard[gameType] ?? 'lotto649';
    const board = await this.prisma.board.findUnique({
      where: { slug: boardSlug },
    });
    if (!board) {
      this.logger.warn(`找不到看板（slug: ${boardSlug}），跳過自動發文`);
      return;
    }

    // 找 admin 帳號作為發文者
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' },
      orderBy: { createdAt: 'asc' },
    });
    if (!admin) {
      this.logger.warn('找不到管理員帳號，跳過自動發文');
      return;
    }

    // 檢查是否已發過此期的文
    const config = GAME_CONFIG[gameType];
    const postTitle = `【${config.name}】第 ${latest.period} 期 開獎結果`;
    const existingPost = await this.prisma.post.findFirst({
      where: {
        boardId: board.id,
        authorId: admin.id,
        title: postTitle,
      },
    });
    if (existingPost) {
      this.logger.log(`第 ${latest.period} 期已有自動發文，跳過`);
      return;
    }

    // 建立文章
    const { title, content } = this.lotteryService.generatePostContent(gameType, latest);

    // 取消舊文章的置頂（同類型的）
    await this.prisma.post.updateMany({
      where: {
        boardId: board.id,
        authorId: admin.id,
        isPinned: true,
        title: { startsWith: `【${config.name}】` },
      },
      data: { isPinned: false },
    });

    await this.prisma.post.create({
      data: {
        boardId: board.id,
        authorId: admin.id,
        title,
        content,
        isPinned: true,
      },
    });

    this.logger.log(`自動發文成功：${title}`);
  }
}
