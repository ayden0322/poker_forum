import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Role, UserStatus, FeedbackType, FeedbackStatus } from '@betting-forum/database';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getMembers(params: {
    page: number;
    limit: number;
    q?: string;
    status?: UserStatus;
    role?: Role;
  }) {
    const { page, limit, q, status, role } = params;
    const skip = (page - 1) * limit;

    const where = {
      ...(q && {
        OR: [
          { nickname: { contains: q, mode: 'insensitive' as const } },
          { account: { contains: q, mode: 'insensitive' as const } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
      }),
      ...(status && { status }),
      ...(role && { role }),
    };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          nickname: true,
          account: true,
          email: true,
          avatar: true,
          level: true,
          role: true,
          status: true,
          lastLoginIp: true,
          lastLoginAt: true,
          passwordHash: true,
          createdAt: true,
          oauthProviders: { select: { provider: true } },
          _count: { select: { posts: true, replies: true, followers: true, following: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map(({ _count, passwordHash, oauthProviders, ...u }) => {
        const loginMethods: string[] = [];
        if (passwordHash) loginMethods.push('ACCOUNT');
        for (const p of oauthProviders) {
          loginMethods.push(p.provider.toUpperCase());
        }
        return {
          ...u,
          loginMethods,
          postCount: _count.posts,
          replyCount: _count.replies,
          followerCount: _count.followers,
          followingCount: _count.following,
        };
      }),
      total,
      page,
      limit,
    };
  }

  async updateMember(id: string, body: { role?: Role; status?: UserStatus }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('找不到此會員');

    return this.prisma.user.update({
      where: { id },
      data: { ...body },
      select: { id: true, nickname: true, role: true, status: true },
    });
  }

  // ===== 分類管理 =====
  async getCategories() {
    return this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { boards: true } } },
    });
  }

  async createCategory(data: { name: string; slug: string; sortOrder?: number }) {
    return this.prisma.category.create({ data });
  }

  async updateCategory(id: string, data: { name?: string; slug?: string; sortOrder?: number }) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('找不到此分類');
    return this.prisma.category.update({ where: { id }, data });
  }

  async deleteCategory(id: string) {
    const cat = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { boards: true } } },
    });
    if (!cat) throw new NotFoundException('找不到此分類');
    if (cat._count.boards > 0) {
      throw new NotFoundException('此分類下仍有看板，無法刪除');
    }
    return this.prisma.category.delete({ where: { id } });
  }

  // ===== 看板管理 =====
  async getBoards() {
    return this.prisma.board.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        category: { select: { id: true, name: true } },
        _count: { select: { posts: true } },
      },
    });
  }

  async createBoard(data: {
    categoryId: string;
    name: string;
    slug: string;
    description?: string;
    icon?: string;
    sortOrder?: number;
  }) {
    return this.prisma.board.create({
      data,
      include: { category: { select: { id: true, name: true } } },
    });
  }

  async updateBoard(
    id: string,
    data: {
      categoryId?: string;
      name?: string;
      slug?: string;
      description?: string;
      icon?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const board = await this.prisma.board.findUnique({ where: { id } });
    if (!board) throw new NotFoundException('找不到此看板');
    return this.prisma.board.update({
      where: { id },
      data,
      include: { category: { select: { id: true, name: true } } },
    });
  }

  async deleteBoard(id: string) {
    const board = await this.prisma.board.findUnique({
      where: { id },
      include: { _count: { select: { posts: true } } },
    });
    if (!board) throw new NotFoundException('找不到此看板');
    if (board._count.posts > 0) {
      throw new NotFoundException('此看板下仍有文章，無法刪除');
    }
    return this.prisma.board.delete({ where: { id } });
  }

  // ===== 文章管理 =====
  async getPosts(params: { page: number; limit: number; q?: string; boardId?: string; isAnnounce?: boolean }) {
    const { page, limit, q, boardId, isAnnounce } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (boardId) where.boardId = boardId;
    if (isAnnounce !== undefined) where.isAnnounce = isAnnounce;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { author: { nickname: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          content: true,
          isPinned: true,
          isLocked: true,
          isAnnounce: true,
          viewCount: true,
          replyCount: true,
          pushCount: true,
          createdAt: true,
          author: { select: { id: true, nickname: true } },
          board: { select: { id: true, name: true } },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async updatePost(
    id: string,
    data: { isPinned?: boolean; isLocked?: boolean; isAnnounce?: boolean },
  ) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('找不到此文章');
    return this.prisma.post.update({ where: { id }, data });
  }

  async deletePost(id: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('找不到此文章');
    await this.prisma.post.delete({ where: { id } });
    return { success: true };
  }

  // ===== 跑馬燈管理 =====
  async getMarquees() {
    return this.prisma.marquee.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async createMarquee(data: { content: string; url?: string; sortOrder?: number }) {
    return this.prisma.marquee.create({ data });
  }

  async updateMarquee(id: string, data: { content?: string; url?: string; sortOrder?: number; isActive?: boolean }) {
    const m = await this.prisma.marquee.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('找不到此跑馬燈');
    return this.prisma.marquee.update({ where: { id }, data });
  }

  async deleteMarquee(id: string) {
    const m = await this.prisma.marquee.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('找不到此跑馬燈');
    return this.prisma.marquee.delete({ where: { id } });
  }

  // ===== 檢舉管理 =====
  async getReports(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { id: true, nickname: true } },
          post: {
            select: {
              id: true,
              title: true,
              content: true,
              author: { select: { id: true, nickname: true } },
              board: { select: { id: true, name: true } },
            },
          },
          reply: {
            select: {
              id: true,
              content: true,
              floorNumber: true,
              author: { select: { id: true, nickname: true } },
              post: { select: { id: true, title: true } },
            },
          },
        },
      }),
      this.prisma.report.count(),
    ]);
    return { items, total, page, limit };
  }

  async updateReport(id: string, status: 'RESOLVED' | 'DISMISSED') {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('找不到此檢舉');
    return this.prisma.report.update({ where: { id }, data: { status } });
  }

  // ===== 標籤管理 =====
  async getTags() {
    return this.prisma.tag.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { posts: true } } },
    });
  }

  async createTag(data: { name: string; slug: string }) {
    return this.prisma.tag.create({ data });
  }

  async updateTag(id: string, data: { name?: string; slug?: string }) {
    return this.prisma.tag.update({ where: { id }, data });
  }

  async deleteTag(id: string) {
    await this.prisma.postTag.deleteMany({ where: { tagId: id } });
    return this.prisma.tag.delete({ where: { id } });
  }

  async getDashboardStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalUsers, totalPosts, newUsersToday, newPostsToday] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.post.count(),
      this.prisma.user.count({ where: { createdAt: { gte: today } } }),
      this.prisma.post.count({ where: { createdAt: { gte: today } } }),
    ]);

    return { totalUsers, totalPosts, newUsersToday, newPostsToday };
  }

  // ===== 封鎖 IP 管理 =====
  async getBannedIps() {
    return this.prisma.bannedIp.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async addBannedIp(ip: string, reason?: string) {
    return this.prisma.bannedIp.upsert({
      where: { ip },
      update: { reason },
      create: { ip, reason },
    });
  }

  async removeBannedIp(id: string) {
    const record = await this.prisma.bannedIp.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('找不到此封鎖記錄');
    return this.prisma.bannedIp.delete({ where: { id } });
  }

  // ===== 意見回報管理 =====
  async getFeedbacks(params: {
    page: number;
    limit: number;
    type?: FeedbackType;
    status?: FeedbackStatus;
  }) {
    const { page, limit, type, status } = params;
    const skip = (page - 1) * limit;

    const where = {
      ...(type && { type }),
      ...(status && { status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.feedback.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          title: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          author: { select: { id: true, nickname: true, avatar: true } },
          _count: { select: { replies: true } },
        },
      }),
      this.prisma.feedback.count({ where }),
    ]);

    return {
      items: items.map(({ _count, ...f }) => ({
        ...f,
        replyCount: _count.replies,
      })),
      total,
      page,
      limit,
    };
  }

  async getFeedbackById(id: string) {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, nickname: true, avatar: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, nickname: true, avatar: true } },
          },
        },
      },
    });
    if (!feedback) throw new NotFoundException('找不到此回報');
    return feedback;
  }

  async createFeedback(authorId: string, data: { type: FeedbackType; title: string; content: string }) {
    return this.prisma.feedback.create({
      data: { ...data, authorId },
      include: {
        author: { select: { id: true, nickname: true, avatar: true } },
      },
    });
  }

  async updateFeedbackStatus(id: string, status: FeedbackStatus) {
    const feedback = await this.prisma.feedback.findUnique({ where: { id } });
    if (!feedback) throw new NotFoundException('找不到此回報');
    return this.prisma.feedback.update({
      where: { id },
      data: { status },
    });
  }

  async deleteFeedback(id: string) {
    const feedback = await this.prisma.feedback.findUnique({ where: { id } });
    if (!feedback) throw new NotFoundException('找不到此回報');
    await this.prisma.feedback.delete({ where: { id } });
    return { success: true };
  }

  async createFeedbackReply(feedbackId: string, authorId: string, content: string) {
    const feedback = await this.prisma.feedback.findUnique({ where: { id: feedbackId } });
    if (!feedback) throw new NotFoundException('找不到此回報');
    return this.prisma.feedbackReply.create({
      data: { feedbackId, authorId, content },
      include: {
        author: { select: { id: true, nickname: true, avatar: true } },
      },
    });
  }
}
