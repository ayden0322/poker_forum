import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { PostStatus } from '@betting-forum/database';

/**
 * 新聞 Agent 自動發文生命週期 cron。
 *
 * 兩條規則都只挑 isAutoPosted=true 的文章，彩券公告（isAutoPosted=false）天然不受影響。
 *
 * 1. 每小時整點 — 退過期置頂
 * 2. 每小時 15 分 — 24h 內無人回覆的自動發文改回 DRAFT 從前台消失
 */
@Injectable()
export class PostsTask {
  private readonly logger = new Logger(PostsTask.name);

  constructor(private prisma: PrismaService) {}

  /** 退過期置頂：isAutoPosted=true AND isPinned=true AND pinnedUntil <= now */
  @Cron('0 * * * *', { timeZone: 'Asia/Taipei' })
  async unpinExpired() {
    const now = new Date();
    const result = await this.prisma.post.updateMany({
      where: {
        isAutoPosted: true,
        isPinned: true,
        pinnedUntil: { lte: now },
      },
      data: {
        isPinned: false,
      },
    });

    if (result.count > 0) {
      this.logger.log(`退置頂：${result.count} 篇自動發文 pinnedUntil 已到期`);
    }
  }

  /** 24h 無互動改 DRAFT：給新聞 Agent 文「24h 內 0 留言 → 從前台消失」 */
  @Cron('15 * * * *', { timeZone: 'Asia/Taipei' })
  async draftIfNoEngagement() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const targets = await this.prisma.post.findMany({
      where: {
        isAutoPosted: true,
        status: PostStatus.PUBLISHED,
        createdAt: { lte: cutoff },
        replyCount: 0,
      },
      select: { id: true, title: true },
    });

    if (targets.length === 0) return;

    const result = await this.prisma.post.updateMany({
      where: { id: { in: targets.map((p) => p.id) } },
      data: { status: PostStatus.DRAFT, isPinned: false, pinnedUntil: null },
    });

    this.logger.log(
      `24h 無互動回 DRAFT：${result.count} 篇 — ${targets.map((p) => `[${p.id}] ${p.title}`).join(' / ')}`,
    );
  }
}
