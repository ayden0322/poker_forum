import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
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
          phone: true,
          phoneVerified: true,
          phoneVerificationBypass: true,
          phoneVerificationBypassReason: true,
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

  async updateMember(
    id: string,
    body: {
      role?: Role;
      status?: UserStatus;
      phoneVerified?: boolean;
      phoneVerificationBypass?: boolean;
      phoneVerificationBypassReason?: string | null;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('找不到此會員');

    // 關閉 bypass 時一併清空原因，避免遺留誤導
    const data: Record<string, unknown> = { ...body };
    if (body.phoneVerificationBypass === false) {
      data.phoneVerificationBypassReason = null;
    }

    // 禁止後台直接將未驗證會員偽造為已驗證，若要繞過驗證請改用「後台放行」
    if (body.phoneVerified === true && !user.phoneVerified) {
      throw new BadRequestException(
        '無法直接將會員設為已驗證，如需繞過驗證請改用「後台放行」',
      );
    }

    // 取消驗證時同步清空驗證時間，下次發文 / 回應需重新跑 SMS 驗證
    if (body.phoneVerified === false) {
      data.phoneVerifiedAt = null;
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        nickname: true,
        role: true,
        status: true,
        phoneVerified: true,
        phoneVerificationBypass: true,
        phoneVerificationBypassReason: true,
      },
    });
  }

  async resetMemberPassword(id: string, newPassword: string) {
    const password = (newPassword ?? '').trim();
    if (password.length < 8) {
      throw new BadRequestException('密碼長度至少 8 個字元');
    }
    if (password.length > 64) {
      throw new BadRequestException('密碼長度不可超過 64 個字元');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, nickname: true, account: true },
    });
    if (!user) throw new NotFoundException('找不到此會員');

    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    return { id: user.id, nickname: user.nickname, account: user.account };
  }

  // ===== 管理員代登入（Impersonation） =====
  /**
   * 取得目標會員，並驗證是否允許被代登入。
   * - 不允許代登入 ADMIN 角色（防止管理員互踩 / 權限提升）
   * - BANNED 的會員不允許代登入（無意義且會違反停用語意）
   */
  async getMemberForImpersonation(targetUserId: string, actorAdminId: string) {
    if (targetUserId === actorAdminId) {
      throw new BadRequestException('不能對自己發起代登入');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, nickname: true, role: true, status: true },
    });
    if (!user) throw new NotFoundException('找不到此會員');

    if (user.role === Role.ADMIN) {
      throw new ForbiddenException('不能代登入其他管理員帳號');
    }
    if (user.status === UserStatus.BANNED) {
      throw new ForbiddenException('會員已被封禁，無法代登入');
    }

    return user;
  }

  /** 寫入操作稽核紀錄。任何失敗都不會 throw，避免影響主流程。 */
  async writeAuditLog(params: {
    actorAdminId: string;
    actorNickname: string;
    action: string;
    targetUserId?: string | null;
    targetNickname?: string | null;
    metadata?: Record<string, unknown>;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorAdminId: params.actorAdminId,
          actorNickname: params.actorNickname,
          action: params.action,
          targetUserId: params.targetUserId ?? null,
          targetNickname: params.targetNickname ?? null,
          metadata: params.metadata ? (params.metadata as object) : undefined,
          ip: params.ip ?? null,
          userAgent: params.userAgent ?? null,
        },
      });
    } catch {
      // audit 寫入失敗不影響使用者操作；正式環境應接 logger
    }
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
  async getPosts(params: {
    page: number;
    limit: number;
    q?: string;
    boardId?: string;
    categoryId?: string;
    section?: 'FEATURED' | 'DISCUSSION';
    status?: 'DRAFT' | 'PUBLISHED';
  }) {
    const { page, limit, q, boardId, categoryId, section, status } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (boardId) where.boardId = boardId;
    else if (categoryId) where.board = { categoryId };
    if (section) where.section = section;
    if (status) where.status = status;
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
          status: true,
          section: true,
          isPinned: true,
          isLocked: true,
          isAutoPosted: true,
          pinnedUntil: true,
          viewCount: true,
          replyCount: true,
          pushCount: true,
          createdAt: true,
          author: { select: { id: true, nickname: true } },
          board: {
            select: {
              id: true,
              name: true,
              category: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Admin 更新文章。
   * status: 'DRAFT' → 'PUBLISHED' 即「發布草稿」動作。
   * section: 'FEATURED' / 'DISCUSSION' 切換板塊頁上下半部分區。
   * title / content 提供 admin 直接編輯草稿內文。
   *
   * pinnedUntil 自動處理規則（僅 isAutoPosted=true 的文章）：
   * - 切換成 isPinned=true → 自動補 pinnedUntil = now + 24h
   * - 切換成 isPinned=false → 自動清空 pinnedUntil
   * 非自動發文（玩家手寫 / 彩券公告）不受影響，行為與原本一致。
   */
  async updatePost(
    id: string,
    data: {
      isPinned?: boolean;
      isLocked?: boolean;
      section?: 'FEATURED' | 'DISCUSSION';
      status?: 'DRAFT' | 'PUBLISHED';
      title?: string;
      content?: string;
      isAutoPosted?: boolean;
    },
  ) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('找不到此文章');

    // pinnedUntil 自動處理：以更新後的 isAutoPosted 狀態為準
    const willBeAutoPosted =
      typeof data.isAutoPosted === 'boolean' ? data.isAutoPosted : post.isAutoPosted;
    const pinnedUntilPatch =
      willBeAutoPosted && typeof data.isPinned === 'boolean'
        ? { pinnedUntil: data.isPinned ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null }
        : !willBeAutoPosted && data.isAutoPosted === false
          ? { pinnedUntil: null } // 從自動發文改回手動 → 清掉到期時間
          : {};

    return this.prisma.post.update({
      where: { id },
      data: { ...data, ...pinnedUntilPatch },
    });
  }

  async deletePost(id: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('找不到此文章');
    await this.prisma.post.delete({ where: { id } });
    return { success: true };
  }

  /**
   * 批次刪除文章。篩選條件與 getPosts 一致，
   * 但強制要 status，避免一鍵清空整個論壇。
   * 文章下層（replies / pushes / bookmarks / tags / reports）皆設 onDelete: Cascade，
   * deleteMany 會由 DB 一起清掉。
   */
  async bulkDeletePosts(params: {
    status: 'DRAFT' | 'PUBLISHED';
    boardId?: string;
    categoryId?: string;
    section?: 'FEATURED' | 'DISCUSSION';
    q?: string;
  }) {
    const { status, boardId, categoryId, section, q } = params;
    if (status !== 'DRAFT' && status !== 'PUBLISHED') {
      throw new BadRequestException('批次刪除必須指定 status=DRAFT 或 PUBLISHED');
    }

    const where: Record<string, unknown> = { status };
    if (boardId) where.boardId = boardId;
    else if (categoryId) where.board = { categoryId };
    if (section) where.section = section;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { author: { nickname: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const result = await this.prisma.post.deleteMany({ where });
    return { count: result.count };
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
