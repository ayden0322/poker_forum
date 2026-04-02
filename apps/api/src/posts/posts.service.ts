import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { Role } from '@betting-forum/database';

@Injectable()
export class PostsService {
  constructor(private prisma: PrismaService) {}

  /** 建立文章 */
  async create(authorId: string, dto: CreatePostDto) {
    const board = await this.prisma.board.findUnique({ where: { id: dto.boardId } });
    if (!board || !board.isActive) throw new NotFoundException('看板不存在或已停用');

    const post = await this.prisma.post.create({
      data: {
        boardId: dto.boardId,
        authorId,
        title: dto.title,
        content: dto.content,
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

    // 重新計算作者等級
    await this.recalculateLevel(authorId);

    return post;
  }

  /** 取得文章詳情 */
  async findById(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, nickname: true, avatar: true, level: true, role: true } },
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

    return { ...post, viewCount: post.viewCount + 1 };
  }

  /** 編輯文章 */
  async update(id: string, userId: string, userRole: Role, dto: UpdatePostDto) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('找不到此文章');

    if (post.authorId !== userId && userRole === Role.USER) {
      throw new ForbiddenException('無權編輯此文章');
    }

    if (post.isLocked && userRole === Role.USER) {
      throw new ForbiddenException('此文章已鎖定');
    }

    // 更新標籤
    if (dto.tagIds !== undefined) {
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

  /** 刪除文章 */
  async remove(id: string, userId: string, userRole: Role) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('找不到此文章');

    if (post.authorId !== userId && userRole === Role.USER) {
      throw new ForbiddenException('無權刪除此文章');
    }

    await this.prisma.post.delete({ where: { id } });
    await this.recalculateLevel(post.authorId);
    return { success: true };
  }

  /** 搜尋文章 */
  async search(params: { q: string; boardId?: string; page: number; limit: number }) {
    const { q, boardId, page, limit } = params;
    const skip = (page - 1) * limit;

    const where = {
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

  /** 重新計算使用者等級 */
  private async recalculateLevel(userId: string) {
    const count = await this.prisma.post.count({ where: { authorId: userId } });
    let level = 1;
    if (count >= 500) level = 6;
    else if (count >= 200) level = 5;
    else if (count >= 100) level = 4;
    else if (count >= 50) level = 3;
    else if (count >= 20) level = 2;

    await this.prisma.user.update({ where: { id: userId }, data: { level } });
  }
}
