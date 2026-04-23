import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  /** 統一搜尋：區塊 + 分類 + 文章 */
  async searchAll(params: { q: string; page: number; limit: number }) {
    const { q, page, limit } = params;
    const query = q.trim();

    if (!query) {
      return {
        boards: [],
        categories: [],
        posts: { items: [], total: 0, page, limit },
      };
    }

    const skip = (page - 1) * limit;
    const insensitive = { mode: 'insensitive' as const };

    const [boards, categories, postItems, postTotal] = await Promise.all([
      this.prisma.board.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: query, ...insensitive } },
            { slug: { contains: query, ...insensitive } },
            { description: { contains: query, ...insensitive } },
          ],
        },
        take: 5,
        orderBy: { sortOrder: 'asc' },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          _count: { select: { posts: true } },
        },
      }),
      this.prisma.category.findMany({
        where: {
          OR: [
            { name: { contains: query, ...insensitive } },
            { slug: { contains: query, ...insensitive } },
          ],
        },
        take: 5,
        orderBy: { sortOrder: 'asc' },
        include: {
          _count: { select: { boards: true } },
        },
      }),
      this.prisma.post.findMany({
        where: {
          OR: [
            { title: { contains: query, ...insensitive } },
            { content: { contains: query, ...insensitive } },
          ],
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, nickname: true, avatar: true, level: true } },
          board: { select: { id: true, name: true, slug: true } },
          tags: { include: { tag: true } },
          _count: { select: { replies: true, pushes: true } },
        },
      }),
      this.prisma.post.count({
        where: {
          OR: [
            { title: { contains: query, ...insensitive } },
            { content: { contains: query, ...insensitive } },
          ],
        },
      }),
    ]);

    return {
      boards,
      categories,
      posts: { items: postItems, total: postTotal, page, limit },
    };
  }
}
