import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { PostStatus, PostSection } from '@betting-forum/database';

/** 站方公告（FEATURED）區塊單次回傳上限，超過此數量需在後台維護收斂 */
const FEATURED_MAX = 20;
/** 最新新聞（NEWS）區塊單次回傳上限 */
const NEWS_MAX = 20;

/** getBoardPosts 回傳結構（供 Redis 快取讀回時標型別用，貼文陣列細節不在此約束） */
export interface BoardPostsResult {
  news: unknown[];
  featured: unknown[];
  discussion: { items: unknown[]; total: number; page: number; limit: number };
}

@Injectable()
export class BoardsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

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

  /**
   * 依 slug 取得分類（含啟用看板），給分類聚合頁（例如 /board/baseball）用。
   * baseball / basketball / soccer 這類是「分類」而非「看板」，單一看板查詢會 404，
   * 故另開分類層級的查詢。沒有啟用看板的空分類視同不存在。
   */
  async getCategoryBySlug(slug: string) {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        boards: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            slug: true,
            _count: { select: { posts: { where: { status: PostStatus.PUBLISHED } } } },
          },
        },
      },
    });
    if (!category || category.boards.length === 0) throw new NotFoundException('找不到此分類');
    const totalPosts = category.boards.reduce((sum, b) => sum + b._count.posts, 0);
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      boards: category.boards.map((b) => ({ id: b.id, name: b.name, slug: b.slug, postCount: b._count.posts })),
      _count: { posts: totalPosts },
    };
  }

  /**
   * 分類聚合文章：跨該分類底下所有啟用看板的 NEWS / FEATURED / DISCUSSION。
   * 結構與 getBoardPosts 一致，差別在 boardId 由單一改為 { in: 看板清單 }，
   * 並在每篇帶上所屬看板（board.slug/name），讓前端能標出聯盟 badge。
   */
  async getCategoryPosts(
    slug: string,
    params: { page: number; limit: number; sort: 'latest' | 'popular' | 'lastReply'; tag?: string; search?: string },
  ) {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: { boards: { where: { isActive: true }, select: { id: true } } },
    });
    if (!category || category.boards.length === 0) throw new NotFoundException('找不到此分類');
    const boardIds = category.boards.map((b) => b.id);

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

    const discussionWhere = {
      boardId: { in: boardIds },
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

    // 聚合頁的 include 多帶 board（slug/name），讓前端標聯盟 badge
    const aggregatedInclude = {
      author: { select: { id: true, nickname: true, avatar: true, level: true, role: true } },
      tags: { include: { tag: true } },
      board: { select: { slug: true, name: true } },
      _count: { select: { replies: true, pushes: true } },
    };

    const newsPromise = search
      ? Promise.resolve([])
      : this.prisma.post.findMany({
          where: { boardId: { in: boardIds }, status: PostStatus.PUBLISHED, section: PostSection.NEWS, ...tagFilter },
          take: NEWS_MAX,
          orderBy: [{ createdAt: 'desc' }],
          include: aggregatedInclude,
        });

    const featuredPromise = search
      ? Promise.resolve([])
      : this.prisma.post.findMany({
          where: { boardId: { in: boardIds }, status: PostStatus.PUBLISHED, section: PostSection.FEATURED, ...tagFilter },
          take: FEATURED_MAX,
          orderBy: [{ createdAt: 'desc' }],
          include: aggregatedInclude,
        });

    const [news, featured, items, total] = await Promise.all([
      newsPromise,
      featuredPromise,
      this.prisma.post.findMany({ where: discussionWhere, skip, take: limit, orderBy, include: aggregatedInclude }),
      this.prisma.post.count({ where: discussionWhere }),
    ]);

    return {
      news,
      featured,
      discussion: { items, total, page, limit },
    };
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
   * 取得看板的文章列表（前台由上而下三區）
   * - news：最新新聞（NEWS，最上）。不分頁、永遠回最新的 NEWS 文章（上限 NEWS_MAX）。
   * - featured：站方公告（FEATURED，中）。不分頁、永遠回最新的 FEATURED 文章（上限 FEATURED_MAX）。
   *   不受 sort / search 影響；tag 篩選會套用（讓使用者點 tag 時 news / featured 也跟著縮）。
   * - discussion：玩家討論（DISCUSSION，下）。維持分頁、套用所有篩選與排序。
   * - 搜尋時 news / featured 自動隱藏，避免「搜尋結果」與置頂區互相混淆。
   */
  async getBoardPosts(
    slug: string,
    params: {
      page: number;
      limit: number;
      sort: 'latest' | 'popular' | 'lastReply';
      tag?: string;
      search?: string;
      light?: boolean;
    },
  ) {
    const { page, limit, sort, tag, search, light } = params;

    // 首頁熱門討論（light）：Redis 快取 60 秒，避免每位訪客都打 DB。
    // 只快取 light：看板詳情頁需即時（發文/回覆後立刻看到），不快取；搜尋千變萬化也不快取。
    const cacheKey = `boards:posts:${slug}:${sort}:${page}:${limit}:${tag ?? ''}:${light ? 1 : 0}`;
    const cacheable = !!light && !search;
    if (cacheable) {
      try {
        const cached = await this.redis.get<BoardPostsResult>(cacheKey);
        if (cached) return cached;
      } catch {
        // Redis 抖動時降級走 DB——快取只是增益，不該讓首頁因快取層出錯而 500
      }
    }

    const board = await this.prisma.board.findUnique({ where: { slug } });
    if (!board || !board.isActive) throw new NotFoundException('找不到此看板');

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

    // === 置頂兩區共用 include ===
    const pinnedInclude = {
      author: { select: { id: true, nickname: true, avatar: true, level: true, role: true } },
      tags: { include: { tag: true } },
      _count: { select: { replies: true, pushes: true } },
    };

    // light 模式（首頁熱門討論）：討論區只取算 hotScore 與卡片需要的欄位，
    // 拿掉 content（文章本文，HotRow 不顯示）以瘦身 payload；tags 仍保留給右欄標籤雲。
    const lightDiscussionSelect = {
      id: true,
      title: true,
      isPinned: true,
      createdAt: true,
      lastReplyAt: true,
      pushCount: true,
      author: { select: { id: true, nickname: true, avatar: true, level: true, role: true } },
      tags: { select: { tag: true } },
      _count: { select: { replies: true, pushes: true } },
    };

    // === 最上：最新新聞（NEWS）===
    // 搜尋進行中時不回，避免擾亂搜尋結果
    const newsPromise = search
      ? Promise.resolve([])
      : this.prisma.post.findMany({
          where: {
            boardId: board.id,
            status: PostStatus.PUBLISHED,
            section: PostSection.NEWS,
            ...tagFilter,
          },
          take: NEWS_MAX,
          orderBy: [{ createdAt: 'desc' }],
          include: pinnedInclude,
        });

    // === 中：站方公告（FEATURED）===
    // light 模式不回公告（首頁熱門討論區塊用不到），少打一次 DB
    const featuredPromise = search || light
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
          include: pinnedInclude,
        });

    const [news, featured, items, total] = await Promise.all([
      newsPromise,
      featuredPromise,
      light
        ? this.prisma.post.findMany({
            where: discussionWhere,
            skip,
            take: limit,
            orderBy,
            select: lightDiscussionSelect,
          })
        : this.prisma.post.findMany({
            where: discussionWhere,
            skip,
            take: limit,
            orderBy,
            include: pinnedInclude,
          }),
      this.prisma.post.count({ where: discussionWhere }),
    ]);

    const result = {
      news,
      featured,
      discussion: { items, total, page, limit },
    };
    if (cacheable) {
      try {
        await this.redis.set(cacheKey, result, 60);
      } catch {
        // 寫快取失敗忽略，不影響本次回應
      }
    }
    return result;
  }
}
