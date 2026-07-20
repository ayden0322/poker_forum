import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateReplyDto } from './dto/create-reply.dto';
import { Role, PostStatus } from '@betting-forum/database';
import { AUTHOR_COSMETIC_SELECT, serializeAuthorCosmetics } from '../common/author-cosmetics';
import { authorRecords } from '../common/author-record';

@Injectable()
export class RepliesService {
  constructor(private prisma: PrismaService) {}

  /** 取得文章的回覆列表（DRAFT 草稿不對外）*/
  async findByPostId(postId: string, page: number, limit: number, userId?: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, status: PostStatus.PUBLISHED },
    });
    if (!post) throw new NotFoundException('找不到此文章');

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.reply.findMany({
        where: { postId },
        skip,
        take: limit,
        orderBy: { floorNumber: 'asc' },
        include: {
          author: { select: { id: true, nickname: true, avatar: true, level: true, role: true, ...AUTHOR_COSMETIC_SELECT } },
          quotedReply: {
            select: {
              id: true,
              floorNumber: true,
              content: true,
              author: { select: { nickname: true } },
            },
          },
          _count: { select: { pushes: true } },
          // 當前登入者是否已推過該回覆（匿名則不查、pushed 恆 false）
          ...(userId ? { pushes: { where: { userId }, select: { id: true } } } : {}),
        },
      }),
      this.prisma.reply.count({ where: { postId } }),
    ]);

    // 一次撈齊本頁所有留言作者的精簡戰績（批次，不做 N+1）
    const recs = await authorRecords(this.prisma, items.map((i) => i.author.id));

    const serialized = items.map((item) => {
      const { author, ...r } = item;
      const { cosmetics, ...a } = author;
      const pushed = (((item as { pushes?: unknown[] }).pushes?.length) ?? 0) > 0;
      const out = {
        ...r,
        pushed,
        author: { ...a, cosmetics: serializeAuthorCosmetics({ cosmetics }), record: recs.get(a.id) ?? null },
      } as Record<string, unknown>;
      delete out.pushes; // 不外洩當前用戶的 push 列
      return out;
    });
    return { items: serialized, total, page, limit };
  }

  /** 新增回覆（僅 PUBLISHED 文章可留言） */
  async create(postId: string, authorId: string, dto: CreateReplyDto) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, status: PostStatus.PUBLISHED },
    });
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
        author: { select: { id: true, nickname: true, avatar: true, level: true, role: true, ...AUTHOR_COSMETIC_SELECT } },
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

    // 序列化裝飾＋戰績章，與回覆列表回應同形（剛送出的回覆也帶框/稱號/徽章/戰績）
    const { cosmetics, ...a } = reply.author;
    const recs = await authorRecords(this.prisma, [a.id]);
    return {
      ...reply,
      author: { ...a, cosmetics: serializeAuthorCosmetics({ cosmetics }), record: recs.get(a.id) ?? null },
    };
  }

  /** 編輯回覆 */
  async update(replyId: string, userId: string, userRole: Role, content: string) {
    const reply = await this.prisma.reply.findUnique({ where: { id: replyId } });
    if (!reply) throw new NotFoundException('找不到此回覆');

    if (reply.authorId !== userId && userRole === Role.USER) {
      throw new ForbiddenException('無權編輯此回覆');
    }

    const updated = await this.prisma.reply.update({
      where: { id: replyId },
      data: { content },
      include: {
        author: { select: { id: true, nickname: true, avatar: true, level: true, role: true, ...AUTHOR_COSMETIC_SELECT } },
      },
    });
    const { cosmetics, ...a } = updated.author;
    const recs = await authorRecords(this.prisma, [a.id]);
    return {
      ...updated,
      author: { ...a, cosmetics: serializeAuthorCosmetics({ cosmetics }), record: recs.get(a.id) ?? null },
    };
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
