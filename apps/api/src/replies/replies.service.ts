import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateReplyDto } from './dto/create-reply.dto';
import { Role } from '@betting-forum/database';

@Injectable()
export class RepliesService {
  constructor(private prisma: PrismaService) {}

  /** 取得文章的回覆列表 */
  async findByPostId(postId: string, page: number, limit: number) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('找不到此文章');

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.reply.findMany({
        where: { postId },
        skip,
        take: limit,
        orderBy: { floorNumber: 'asc' },
        include: {
          author: { select: { id: true, nickname: true, avatar: true, level: true, role: true } },
          quotedReply: {
            select: {
              id: true,
              floorNumber: true,
              content: true,
              author: { select: { nickname: true } },
            },
          },
          _count: { select: { pushes: true } },
        },
      }),
      this.prisma.reply.count({ where: { postId } }),
    ]);

    return { items, total, page, limit };
  }

  /** 新增回覆 */
  async create(postId: string, authorId: string, dto: CreateReplyDto) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('找不到此文章');
    if (post.isLocked) throw new ForbiddenException('此文章已鎖定，無法回覆');

    // 計算樓層號
    const lastReply = await this.prisma.reply.findFirst({
      where: { postId },
      orderBy: { floorNumber: 'desc' },
      select: { floorNumber: true },
    });
    const floorNumber = (lastReply?.floorNumber ?? 0) + 1;

    const reply = await this.prisma.reply.create({
      data: {
        postId,
        authorId,
        floorNumber,
        content: dto.content,
        quotedReplyId: dto.quotedReplyId ?? null,
      },
      include: {
        author: { select: { id: true, nickname: true, avatar: true, level: true, role: true } },
        quotedReply: {
          select: {
            id: true,
            floorNumber: true,
            content: true,
            author: { select: { nickname: true } },
          },
        },
      },
    });

    // 更新文章回覆數和最後回覆
    await this.prisma.post.update({
      where: { id: postId },
      data: {
        replyCount: { increment: 1 },
        lastReplyAt: new Date(),
        lastReplyBy: authorId,
      },
    });

    // 通知文章作者（不通知自己）
    if (post.authorId !== authorId) {
      await this.prisma.notification.create({
        data: {
          userId: post.authorId,
          type: 'REPLY',
          content: `你的文章「${post.title}」有新回覆`,
          sourceUrl: `/post/${postId}`,
        },
      });
    }

    return reply;
  }

  /** 編輯回覆 */
  async update(replyId: string, userId: string, userRole: Role, content: string) {
    const reply = await this.prisma.reply.findUnique({ where: { id: replyId } });
    if (!reply) throw new NotFoundException('找不到此回覆');

    if (reply.authorId !== userId && userRole === Role.USER) {
      throw new ForbiddenException('無權編輯此回覆');
    }

    return this.prisma.reply.update({
      where: { id: replyId },
      data: { content },
      include: {
        author: { select: { id: true, nickname: true, avatar: true, level: true, role: true } },
      },
    });
  }

  /** 刪除回覆 */
  async remove(replyId: string, userId: string, userRole: Role) {
    const reply = await this.prisma.reply.findUnique({
      where: { id: replyId },
      include: { post: { select: { id: true } } },
    });
    if (!reply) throw new NotFoundException('找不到此回覆');

    if (reply.authorId !== userId && userRole === Role.USER) {
      throw new ForbiddenException('無權刪除此回覆');
    }

    await this.prisma.reply.delete({ where: { id: replyId } });

    // 更新文章回覆數
    await this.prisma.post.update({
      where: { id: reply.postId },
      data: { replyCount: { decrement: 1 } },
    });

    return { success: true };
  }
}
