import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class PushesService {
  constructor(private prisma: PrismaService) {}

  /** 推文章 */
  async pushPost(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('找不到此文章');

    const existing = await this.prisma.push.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (existing) throw new ConflictException('已經推過此文章');

    await this.prisma.push.create({ data: { userId, postId } });
    await this.prisma.post.update({
      where: { id: postId },
      data: { pushCount: { increment: 1 } },
    });

    // 通知文章作者
    if (post.authorId !== userId) {
      await this.prisma.notification.create({
        data: {
          userId: post.authorId,
          type: 'PUSH',
          content: `你的文章「${post.title}」被推了一下`,
          sourceUrl: `/post/${postId}`,
        },
      });
    }

    return { pushed: true };
  }

  /** 取消推文章 */
  async unpushPost(postId: string, userId: string) {
    const existing = await this.prisma.push.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!existing) throw new NotFoundException('尚未推過此文章');

    await this.prisma.push.delete({ where: { id: existing.id } });
    await this.prisma.post.update({
      where: { id: postId },
      data: { pushCount: { decrement: 1 } },
    });

    return { pushed: false };
  }

  /** 推回覆 */
  async pushReply(replyId: string, userId: string) {
    const reply = await this.prisma.reply.findUnique({ where: { id: replyId } });
    if (!reply) throw new NotFoundException('找不到此回覆');

    const existing = await this.prisma.push.findUnique({
      where: { userId_replyId: { userId, replyId } },
    });
    if (existing) throw new ConflictException('已經推過此回覆');

    await this.prisma.push.create({ data: { userId, replyId } });
    await this.prisma.reply.update({
      where: { id: replyId },
      data: { pushCount: { increment: 1 } },
    });

    return { pushed: true };
  }

  /** 取消推回覆 */
  async unpushReply(replyId: string, userId: string) {
    const existing = await this.prisma.push.findUnique({
      where: { userId_replyId: { userId, replyId } },
    });
    if (!existing) throw new NotFoundException('尚未推過此回覆');

    await this.prisma.push.delete({ where: { id: existing.id } });
    await this.prisma.reply.update({
      where: { id: replyId },
      data: { pushCount: { decrement: 1 } },
    });

    return { pushed: false };
  }

  /** 檢查使用者是否推過 */
  async getUserPushStatus(userId: string, postId: string) {
    const push = await this.prisma.push.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    return { pushed: !!push };
  }
}
