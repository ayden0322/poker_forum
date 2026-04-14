import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class BoardsService {
  constructor(private prisma: PrismaService) {}

  /** 取得啟用中的跑馬燈 */
  async getActiveMarquees() {
    return this.prisma.marquee.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, content: true, url: true },
    });
  }

  /** 取得所有分類（含看板），按排序。自動過濾掉沒有啟用看板的空分類。 */
  async getCategoriesWithBoards() {
    const categories = await this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        boards: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            _count: { select: { posts: true } },
          },
        },
      },
    });
    // 過濾掉沒有啟用看板的空分類
    return categories.filter((c) => c.boards.length > 0);
  }

  /** 依 slug 取得看板 */
  async getBoardBySlug(slug: string) {
    const board = await this.prisma.board.findUnique({
      where: { slug },
      include: {
        category: true,
        _count: { select: { posts: true } },
      },
    });
    if (!board || !board.isActive) throw new NotFoundException('找不到此看板');
    return board;
  }

  /** 取得看板的文章列表 */
  async getBoardPosts(
    slug: string,
    params: { page: number; limit: number; sort: 'latest' | 'popular' | 'lastReply'; tag?: string; search?: string },
  ) {
    const board = await this.prisma.board.findUnique({ where: { slug } });
    if (!board || !board.isActive) throw new NotFoundException('找不到此看板');

    const { page, limit, sort, tag, search } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { boardId: board.id };

    if (tag) {
      where.tags = { some: { tag: { slug: tag } } };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy =
      sort === 'popular'
        ? [{ isPinned: 'desc' as const }, { pushCount: 'desc' as const }, { createdAt: 'desc' as const }]
        : sort === 'lastReply'
          ? [{ isPinned: 'desc' as const }, { lastReplyAt: 'desc' as const }, { createdAt: 'desc' as const }]
          : [{ isPinned: 'desc' as const }, { createdAt: 'desc' as const }];

    const [items, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          author: { select: { id: true, nickname: true, avatar: true, level: true, role: true } },
          tags: { include: { tag: true } },
          _count: { select: { replies: true, pushes: true } },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    return { items, total, page, limit };
  }
}
