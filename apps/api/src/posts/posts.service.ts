import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { TagsService } from '../tags/tags.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { Role, PostStatus } from '@betting-forum/database';
import { AUTHOR_COSMETIC_SELECT, serializeAuthorCosmetics } from '../common/author-cosmetics';

// 新聞 Agent 自動發文預設置頂時長
export const AUTO_POST_PIN_HOURS = 24;

@Injectable()
export class PostsService {
  constructor(
    private prisma: PrismaService,
    private tagsService: TagsService,
  ) {}

  /**
   * 驗證 tagIds 是否都屬於「該看板分類允許的標籤集合」。
   * 擋掉繞過前端、直接 POST 不屬於此分類的標籤（例如運動板硬塞彩券標籤）造成資料污染。
   */
  private async assertTagsAllowed(boardId: string, tagIds?: string[]) {
    if (!tagIds?.length) return;
    const allowed = await this.tagsService.getAllowedTagIds(boardId);
    const invalid = tagIds.filter((id) => !allowed.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException('所選標籤不適用於此看板');
    }
  }

  /** 建立文章 */
  async create(authorId: string, userRole: string, dto: CreatePostDto) {
    const board = await this.prisma.board.findUnique({ where: { id: dto.boardId } });
    if (!board || !board.isActive) throw new NotFoundException('看板不存在或已停用');

    // 標籤必須屬於該看板分類的允許集合（後端閘門，不只靠前端過濾）
    await this.assertTagsAllowed(dto.boardId, dto.tagIds);

    // 只有 ADMIN / SUPER_ADMIN 能標自己是自動發文（新聞 agent）；其他角色傳 true 也忽略
    const isAutoPosted =
      dto.isAutoPosted === true &&
      (userRole === Role.ADMIN || userRole === Role.SUPER_ADMIN);

    // lastReplyAt 語意為「最後活動時間」：發文時等於發表時間，之後 reply 來才更新。
    // 這樣前端按 lastReplyAt desc 排序時，「沒人回的新文」也能依發表時間正確排入序列，
    // 避免 nullable 欄位混入排序造成 NULLS LAST/FIRST 行為不一致的地雷。
    const now = new Date();

    const post = await this.prisma.post.create({
      data: {
        boardId: dto.boardId,
        authorId,
        title: dto.title,
        content: dto.content,
        ...(dto.status && { status: dto.status }),
        isAutoPosted,
        lastReplyAt: now,
        tags: dto.tagIds?.length
          ? { create: dto.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: {
        author: { select: { id: true, nickname: true, avatar: true, level: true, role: true } },
        board: { select: { id: true, name: true, slug: true } },
        tags: { include: { tag: true } },
      },
    });

    // 等級改由會員系統的經驗值決定（LevelService.addExp），不再用發文數重算

    return post;
  }

  /** 取得文章詳情（僅公開的 PUBLISHED 文章；DRAFT 草稿不對外） */
  async findById(id: string) {
    const post = await this.prisma.post.findFirst({
      where: { id, status: PostStatus.PUBLISHED },
      include: {
        author: { select: { id: true, nickname: true, avatar: true, level: true, role: true, ...AUTHOR_COSMETIC_SELECT } },
        board: { select: { id: true, name: true, slug: true, category: { select: { id: true, name: true } } } },
        tags: { include: { tag: true } },
        _count: { select: { replies: true, pushes: true, bookmarks: true } },
      },
    });
    if (!post) throw new NotFoundException('找不到此文章');

    // 增加瀏覽數
    await this.prisma.post.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    const { cosmetics, ...author } = post.author;
    return {
      ...post,
      viewCount: post.viewCount + 1,
      author: { ...author, cosmetics: serializeAuthorCosmetics({ cosmetics }) },
    };
  }

  /** 編輯文章（僅 PUBLISHED；DRAFT 編輯走 admin endpoint） */
  async update(id: string, userId: string, userRole: Role, dto: UpdatePostDto) {
    const post = await this.prisma.post.findFirst({
      where: { id, status: PostStatus.PUBLISHED },
    });
    if (!post) throw new NotFoundException('找不到此文章');

    if (post.authorId !== userId && userRole === Role.USER) {
      throw new ForbiddenException('無權編輯此文章');
    }

    if (post.isLocked && userRole === Role.USER) {
      throw new ForbiddenException('此文章已鎖定');
    }

    // 更新標籤
    if (dto.tagIds !== undefined) {
      // 同 create：改文也要驗證標籤屬於此看板分類
      await this.assertTagsAllowed(post.boardId, dto.tagIds);
      await this.prisma.postTag.deleteMany({ where: { postId: id } });
      if (dto.tagIds.length > 0) {
        await this.prisma.postTag.createMany({
          data: dto.tagIds.map((tagId) => ({ postId: id, tagId })),
        });
      }
    }

    return this.prisma.post.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.content && { content: dto.content }),
      },
      include: {
        author: { select: { id: true, nickname: true, avatar: true, level: true, role: true } },
        tags: { include: { tag: true } },
      },
    });
  }

  /** 刪除文章（僅 PUBLISHED；DRAFT 刪除走 admin endpoint） */
  async remove(id: string, userId: string, userRole: Role) {
    const post = await this.prisma.post.findFirst({
      where: { id, status: PostStatus.PUBLISHED },
    });
    if (!post) throw new NotFoundException('找不到此文章');

    if (post.authorId !== userId && userRole === Role.USER) {
      throw new ForbiddenException('無權刪除此文章');
    }

    await this.prisma.post.delete({ where: { id } });
    return { success: true };
  }

  /** 搜尋文章 */
  async search(params: { q: string; boardId?: string; page: number; limit: number }) {
    const { q, boardId, page, limit } = params;
    const skip = (page - 1) * limit;

    const where = {
      status: PostStatus.PUBLISHED,
      ...(boardId && { boardId }),
      OR: [
        { title: { contains: q, mode: 'insensitive' as const } },
        { content: { contains: q, mode: 'insensitive' as const } },
      ],
    };

    const [items, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
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
      this.prisma.post.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * sitemap 用：列出已發布文章的最小欄位（id + 板塊 slug + 更新時間）。
   * 薄板塊過濾交由前端 sitemap.ts 的 isBoardIndexable() 處理，維持索引控制的單一真相來源。
   * 上限 5000 篇（依 updatedAt 由新到舊），遠低於 Google 單一 sitemap 50000 上限，避免巨站時 payload 過大。
   */
  async listForSitemap(limit = 5000) {
    return this.prisma.post.findMany({
      where: { status: PostStatus.PUBLISHED },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        updatedAt: true,
        board: { select: { slug: true } },
      },
    });
  }
}
