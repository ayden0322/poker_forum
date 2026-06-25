import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';
import { Role, UserStatus, FeedbackType, FeedbackStatus, PostStatus, TagScope, CategoryType } from '@betting-forum/database';
import { rankOf, ROLE_RANK } from '../common/role-hierarchy';
import { PagePermissionService } from './page-permission.service';

/** PII 遮罩工具：保留少量頭尾、中間打碼，供無 cap:member:pii 的管理員顯示用。 */
function maskTail(v: string | null): string | null {
  if (!v) return v;
  if (v.length <= 2) return '*'.repeat(v.length);
  return v.slice(0, 2) + '***';
}
function maskEmail(v: string | null): string | null {
  if (!v) return v;
  const at = v.indexOf('@');
  if (at <= 0) return maskTail(v);
  const name = v.slice(0, at);
  const domain = v.slice(at);
  const head = name.slice(0, 1);
  return `${head}***${domain}`;
}
function maskPhone(v: string | null): string | null {
  if (!v) return v;
  if (v.length <= 4) return '*'.repeat(v.length);
  return v.slice(0, 3) + '***' + v.slice(-2);
}

/** 驗證傳入值屬於某 enum；undefined 視為「不更動」放行，非法值回 400。 */
function assertEnum<T extends Record<string, string>>(
  value: string | undefined,
  enumObj: T,
  label: string,
): void {
  if (value !== undefined && !Object.values(enumObj).includes(value)) {
    throw new BadRequestException(`無效的${label}：${value}`);
  }
}

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private permService: PagePermissionService,
  ) {}

  async getMembers(params: {
    page: number;
    limit: number;
    q?: string;
    status?: UserStatus;
    role?: Role;
    // tier='admin' 只看管理團隊（編輯人員以上）、'user' 只看一般會員。
    // 用於後台「會員管理」與「管理員管理」兩頁分流。role 明確指定時優先於 tier。
    tier?: 'admin' | 'user';
    // 無 cap:member:pii 時：遮罩 PII 顯示，且搜尋只比對暱稱（避免用完整 email/phone 反推命中）。
    canSeePii?: boolean;
  }) {
    const { page, limit, q, status, role, tier, canSeePii = false } = params;
    const skip = (page - 1) * limit;

    const roleFilter = role
      ? { role }
      : tier === 'admin'
        ? { role: { in: [Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN] } }
        : tier === 'user'
          ? { role: Role.USER }
          : {};

    const where = {
      ...(q && {
        OR: canSeePii
          ? [
              { nickname: { contains: q, mode: 'insensitive' as const } },
              { account: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
            ]
          : // 側信道防護：無 PII 權限只能搜暱稱
            [{ nickname: { contains: q, mode: 'insensitive' as const } }],
      }),
      ...(status && { status }),
      ...roleFilter,
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
        // PII 遮罩做在後端唯一出口（單一資料源），無權者拿不到明碼，前端再怎麼挖也挖不出。
        const pii = canSeePii
          ? { account: u.account, email: u.email, phone: u.phone, lastLoginIp: u.lastLoginIp }
          : {
              account: maskTail(u.account),
              email: maskEmail(u.email),
              phone: maskPhone(u.phone),
              lastLoginIp: u.lastLoginIp ? '***' : null,
            };
        return {
          ...u,
          ...pii,
          piiMasked: !canSeePii,
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
    actor?: { id: string; role: Role },
  ) {
    const actorRole = actor?.role;
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('找不到此會員');

    // 角色階層級聯規則：操作者必須「嚴格高於」目標的現有層級，且只能指派「嚴格低於自己」的層級。
    // 例：總管理員可把一般會員升成編輯人員、可降編輯人員；但碰不到其他總管理員，也不能指派出總管理員(平級)或超級管理員。
    if (body.role !== undefined) {
      const actorRank = rankOf(actorRole);
      const targetRank = rankOf(user.role);
      const newRank = rankOf(body.role);
      if (!(actorRank > targetRank && actorRank > newRank)) {
        throw new ForbiddenException(
          '只能調整比你低階的帳號，且不能指派到你自己或更高的層級',
        );
      }
    }

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

    // 角色異動時同步維護帳號權限列（與更新放同一交易，確保一致）：
    // - 一般會員 → 管理員：seed 該角色預設權限（並與 actor 可授出範圍取交集，防擴張）
    // - 管理員 → 一般會員：清空所有權限列（避免日後再升級時舊權限復活）
    // - 管理員層級互換(MOD↔ADMIN)：不動權限，由管理者用權限編輯器調整
    const roleChanged = body.role !== undefined && body.role !== user.role;
    const wasAdmin = rankOf(user.role) >= ROLE_RANK.MODERATOR;
    const willBeAdmin = body.role !== undefined && rankOf(body.role) >= ROLE_RANK.MODERATOR;

    let grantable: Set<string> | undefined;
    if (roleChanged && !wasAdmin && willBeAdmin && actor) {
      grantable = await this.permService.grantableSetFor(actor);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
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

      if (roleChanged) {
        if (!willBeAdmin) {
          await this.permService.clearPermissions(tx, id);
        } else if (!wasAdmin) {
          await this.permService.seedDefaultsForRole(
            tx,
            id,
            body.role as 'MODERATOR' | 'ADMIN',
            grantable,
          );
        }
      }

      return updated;
    });
  }

  async resetMemberPassword(id: string, newPassword: string, actorRole?: Role) {
    const password = (newPassword ?? '').trim();
    if (password.length < 8) {
      throw new BadRequestException('密碼長度至少 8 個字元');
    }
    if (password.length > 64) {
      throw new BadRequestException('密碼長度不可超過 64 個字元');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, nickname: true, role: true },
    });
    if (!user) throw new NotFoundException('找不到此會員');

    // 階層級聯：只能重設「嚴格比自己低階」帳號的密碼，避免編輯人員重設管理員 / 超管密碼。
    if (!(rankOf(actorRole) > rankOf(user.role))) {
      throw new ForbiddenException('只能重設比你低階帳號的密碼');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    // 不回傳 account（屬 PII）：重設密碼能力不等於可見個資
    return { id: user.id, nickname: user.nickname };
  }

  // ===== 管理員代登入（Impersonation） =====
  /**
   * 取得目標會員，並驗證是否允許被代登入。
   * - 不允許代登入 ADMIN / SUPER_ADMIN 角色（防止管理員互踩 / 權限提升）
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

    // 只能代登入一般會員：管理團隊（含 MODERATOR）一律禁止，避免管理員互踩 / 權限提升
    if (user.role !== Role.USER) {
      throw new ForbiddenException('只能代登入一般會員，不能代登入管理團隊帳號');
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

  async createCategory(data: {
    name: string;
    slug: string;
    sortOrder?: number;
    type?: CategoryType;
  }) {
    assertEnum(data.type, CategoryType, '分類型別');
    return this.prisma.category.create({ data });
  }

  async updateCategory(
    id: string,
    data: { name?: string; slug?: string; sortOrder?: number; type?: CategoryType },
  ) {
    assertEnum(data.type, CategoryType, '分類型別');
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
    section?: 'NEWS' | 'FEATURED' | 'DISCUSSION';
    status?: 'DRAFT' | 'PUBLISHED';
    isAutoPosted?: boolean;
  }) {
    const { page, limit, q, boardId, categoryId, section, status, isAutoPosted } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (boardId) where.boardId = boardId;
    else if (categoryId) where.board = { categoryId };
    if (section) where.section = section;
    if (status) where.status = status;
    // 新聞分流：文章管理頁帶 false 只看使用者/手動文章；新聞審核頁帶 true 只看自動發文
    if (typeof isAutoPosted === 'boolean') where.isAutoPosted = isAutoPosted;
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
   * 依看板統計文章數（給後台看板篩選下拉顯示「待審 N」用）。
   * 預設用於 status=DRAFT + isAutoPosted 分流，回傳 [{ boardId, count }]。
   */
  async getBoardPostCounts(params: {
    status?: 'DRAFT' | 'PUBLISHED';
    isAutoPosted?: boolean;
  }) {
    const { status, isAutoPosted } = params;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (typeof isAutoPosted === 'boolean') where.isAutoPosted = isAutoPosted;

    const rows = await this.prisma.post.groupBy({
      by: ['boardId'],
      where,
      _count: { _all: true },
    });
    return rows.map((r) => ({ boardId: r.boardId, count: r._count._all }));
  }

  /**
   * Admin 更新文章。
   * status: 'DRAFT' → 'PUBLISHED' 即「發布草稿」動作（＝審核通過）。
   * section: 'NEWS' / 'FEATURED' / 'DISCUSSION' 切換板塊頁分區（最新新聞 / 站方公告 / 玩家討論）。
   * title / content 提供 admin 直接編輯草稿內文。
   *
   * 自動發文（新聞 agent）審核通過時的預設行為（呼叫端未明確指定才套用）：
   * - section 自動落 NEWS（最新新聞區），讓審核通過的新聞直接上該看板新聞板塊
   * - isPinned 自動置頂（搭配下方 pinnedUntil 補 24h）
   *
   * pinnedUntil 自動處理規則（僅 isAutoPosted=true 的文章）：
   * - 最終置頂為 true → 自動補 pinnedUntil = now + 24h
   * - 最終置頂為 false → 自動清空 pinnedUntil
   * 非自動發文（玩家手寫 / 彩券公告）不受影響，行為與原本一致。
   *
   * publishedAt：首次 DRAFT→PUBLISHED 當下寫入，給「24h 無互動退草稿」cron 以發布時間起算。
   */
  async updatePost(
    id: string,
    data: {
      isPinned?: boolean;
      isLocked?: boolean;
      section?: 'NEWS' | 'FEATURED' | 'DISCUSSION';
      status?: 'DRAFT' | 'PUBLISHED';
      title?: string;
      content?: string;
      isAutoPosted?: boolean;
    },
  ) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('找不到此文章');

    const willBeAutoPosted =
      typeof data.isAutoPosted === 'boolean' ? data.isAutoPosted : post.isAutoPosted;

    // 這次操作是否把文章從草稿轉成發布（＝審核通過）
    const isPublishing =
      data.status === 'PUBLISHED' && post.status !== PostStatus.PUBLISHED;

    // 自動新聞審核通過：呼叫端沒指定 section / isPinned 時，預設落新聞區 + 置頂
    const autoNewsOnPublish = isPublishing && willBeAutoPosted;
    const sectionPatch =
      autoNewsOnPublish && data.section === undefined ? { section: 'NEWS' as const } : {};
    const effectiveIsPinned =
      autoNewsOnPublish && data.isPinned === undefined ? true : data.isPinned;

    // 首次發布寫入 publishedAt
    const publishedAtPatch =
      isPublishing && !post.publishedAt ? { publishedAt: new Date() } : {};

    // pinnedUntil 自動處理：以更新後的 isAutoPosted 與最終置頂狀態為準
    const pinnedUntilPatch =
      willBeAutoPosted && typeof effectiveIsPinned === 'boolean'
        ? { pinnedUntil: effectiveIsPinned ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null }
        : !willBeAutoPosted && data.isAutoPosted === false
          ? { pinnedUntil: null } // 從自動發文改回手動 → 清掉到期時間
          : {};

    return this.prisma.post.update({
      where: { id },
      data: {
        ...data,
        ...(effectiveIsPinned !== undefined ? { isPinned: effectiveIsPinned } : {}),
        ...sectionPatch,
        ...publishedAtPatch,
        ...pinnedUntilPatch,
      },
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
    section?: 'NEWS' | 'FEATURED' | 'DISCUSSION';
    q?: string;
    isAutoPosted?: boolean;
  }) {
    const { status, boardId, categoryId, section, q, isAutoPosted } = params;
    if (status !== 'DRAFT' && status !== 'PUBLISHED') {
      throw new BadRequestException('批次刪除必須指定 status=DRAFT 或 PUBLISHED');
    }

    const where: Record<string, unknown> = { status };
    if (boardId) where.boardId = boardId;
    else if (categoryId) where.board = { categoryId };
    if (section) where.section = section;
    if (typeof isAutoPosted === 'boolean') where.isAutoPosted = isAutoPosted;
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
      orderBy: [{ scope: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { posts: true } } },
    });
  }

  async createTag(data: { name: string; slug: string; scope?: TagScope; sortOrder?: number }) {
    assertEnum(data.scope, TagScope, '標籤範圍');
    return this.prisma.tag.create({ data });
  }

  async updateTag(
    id: string,
    data: { name?: string; slug?: string; scope?: TagScope; sortOrder?: number },
  ) {
    assertEnum(data.scope, TagScope, '標籤範圍');
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
