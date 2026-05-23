import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PostStatus, PostSection } from '@betting-forum/database';

/** 站方推送（FEATURED）區塊單次回傳上限，超過此數量需在後台維護收斂 */
const FEATURED_MAX = 20;

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
            _count: {
              select: { posts: { where: { status: PostStatus.PUBLISHED } } },
            },
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
        _count: {
          select: { posts: { where: { status: PostStatus.PUBLISHED } } },
        },
      },
    });
    if (!board || !board.isActive) throw new NotFoundException('找不到此看板');
    return board;
  }

  /**
   * 取得看板的文章列表
   * - featured：站方推送（上半部）。不分頁、永遠回最新的 FEATURED 文章（上限 FEATURED_MAX）。
   *   不受 sort / search 影響；tag 篩選會套用（讓使用者點 tag 時 featured 也跟著縮）。
   * - discussion：玩家討論（下半部）。維持分頁、套用所有篩選與排序。
   * - 搜尋時 featured 自動隱藏，避免「搜尋結果」與「站方推送」互相混淆。
   */
  async getBoardPosts(
    slug: string,
    params: { page: number; limit: number; sort: 'latest' | 'popular' | 'lastReply'; tag?: string; search?: string },
  ) {
    const board = await this.prisma.board.findUnique({ where: { slug } });
    if (!board || !board.isActive) throw new NotFoundException('找不到此看板');

    const { page, limit, sort, tag, search } = params;
    const skip = (page - 1) * limit;

    const tagFilter = tag ? { tags: { some: { tag: { slug: tag } } } } : {};
    const searchFilter = search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { content: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    // === 下半部：玩家討論 ===
    const discussionWhere = {
      boardId: board.id,
      status: PostStatus.PUBLISHED,
      section: PostSection.DISCUSSION,
      ...tagFilter,
      ...searchFilter,
    };

    const orderBy =
      sort === 'popular'
        ? [{ isPinned: 'desc' as const }, { pushCount: 'desc' as const }, { createdAt: 'desc' as const }]
        : sort === 'lastReply'
          ? [{ isPinned: 'desc' as const }, { lastReplyAt: 'desc' as const }, { createdAt: 'desc' as const }]
          : [{ isPinned: 'desc' as const }, { createdAt: 'desc' as const }];

    // === 上半部：站方推送 ===
    // 搜尋進行中時不回 featured，避免擾亂搜尋結果
    const featuredPromise = search
      ? Promise.resolve([])
      : this.prisma.post.findMany({
          where: {
            boardId: board.id,
            status: PostStatus.PUBLISHED,
            section: PostSection.FEATURED,
            ...tagFilter,
          },
          take: FEATURED_MAX,
          orderBy: [{ createdAt: 'desc' }],
          include: {
            author: { select: { id: true, nickname: true, avatar: true, level: true, role: true } },
            tags: { include: { tag: true } },
            _count: { select: { replies: true, pushes: true } },
          },
        });

    const [featured, items, total] = await Promise.all([
      featuredPromise,
      this.prisma.post.findMany({
        where: discussionWhere,
        skip,
        take: limit,
        orderBy,
        include: {
          author: { select: { id: true, nickname: true, avatar: true, level: true, role: true } },
          tags: { include: { tag: true } },
          _count: { select: { replies: true, pushes: true } },
        },
      }),
      this.prisma.post.count({ where: discussionWhere }),
    ]);

    return {
      featured,
      discussion: { items, total, page, limit },
    };
  }
}
