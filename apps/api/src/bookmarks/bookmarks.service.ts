import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PostStatus } from '@betting-forum/database';

@Injectable()
export class BookmarksService {
  constructor(private prisma: PrismaService) {}

  async getUserBookmarks(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    // 過濾掉指向 DRAFT 的收藏（不對外顯示草稿）
    const where = {
      userId,
      post: { status: PostStatus.PUBLISHED },
    };

    const [items, total] = await Promise.all([
      this.prisma.bookmark.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          post: {
            select: {
              id: true,
              title: true,
              viewCount: true,
              replyCount: true,
              createdAt: true,
              author: { select: { id: true, nickname: true } },
              board: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      }),
      this.prisma.bookmark.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async addBookmark(userId: string, postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, status: PostStatus.PUBLISHED },
    });
    if (!post) throw new NotFoundException('找不到此文章');

    const existing = await this.prisma.bookmark.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (existing) throw new ConflictException('已收藏此文章');

    await this.prisma.bookmark.create({ data: { userId, postId } });
    return { bookmarked: true };
  }

  async removeBookmark(userId: string, postId: string) {
    const existing = await this.prisma.bookmark.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!existing) throw new NotFoundException('尚未收藏此文章');

    await this.prisma.bookmark.delete({ where: { id: existing.id } });
    return { bookmarked: false };
  }

  async checkBookmark(userId: string, postId: string) {
    const existing = await this.prisma.bookmark.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    return { bookmarked: !!existing };
  }
}
