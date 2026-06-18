import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { AdminService } from './admin.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PageGuard } from '../common/guards/page.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role, UserStatus, FeedbackType, FeedbackStatus, TagScope, CategoryType } from '@betting-forum/database';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { getClientIp } from '../common/get-client-ip.util';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PageGuard)
@Roles(Role.MODERATOR) // floor：編輯人員以上可進；實際每頁可見性由 PageGuard 讀權限矩陣決定
@Controller('admin')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private authService: AuthService,
  ) {}

  @Roles(Role.MODERATOR) // 編輯人員可看儀表板
  @Get('stats')
  async getStats() {
    const data = await this.adminService.getDashboardStats();
    return { data };
  }

  @Get('members')
  async getMembers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('q') q?: string,
    @Query('status') status?: UserStatus,
    @Query('role') role?: Role,
    @Query('tier') tier?: 'admin' | 'user',
  ) {
    const data = await this.adminService.getMembers({
      page,
      limit,
      q,
      status,
      role,
      tier: tier === 'admin' || tier === 'user' ? tier : undefined,
    });
    return { data };
  }

  @Patch('members/:id')
  async updateMember(
    @Param('id') id: string,
    @CurrentUser() actor: { id: string; role: Role },
    @Body()
    body: {
      role?: Role;
      status?: UserStatus;
      phoneVerified?: boolean;
      phoneVerificationBypass?: boolean;
      phoneVerificationBypassReason?: string | null;
    },
  ) {
    // 角色變更走階層級聯規則（在 service 內依操作者層級判斷）：
    // 只能調整比自己低階的帳號，且不能指派到自己或更高的層級。
    const data = await this.adminService.updateMember(id, body, actor.role);
    return { data };
  }

  @Patch('members/:id/password')
  async resetMemberPassword(
    @Param('id') id: string,
    @Body() body: { password: string },
  ) {
    const data = await this.adminService.resetMemberPassword(id, body?.password);
    return { data };
  }

  /**
   * 管理員代登入會員（Impersonation）
   * - 需 ADMIN 角色
   * - 不可代登入其他 ADMIN，亦不可代登入 BANNED 會員
   * - 簽發 1 小時短效 token，並寫入 audit log
   * - 回傳的 token 由 admin 端開新分頁帶到前台使用
   */
  @Post('members/:id/impersonate')
  @ApiOperation({ summary: '管理員代登入會員' })
  async impersonateMember(
    @Param('id') targetUserId: string,
    @CurrentUser() admin: { id: string; nickname: string },
    @Req() req: Request,
    @Body() body: { reason?: string } = {},
  ) {
    const target = await this.adminService.getMemberForImpersonation(targetUserId, admin.id);

    const tokens = await this.authService.generateImpersonationTokens(
      target.id,
      target.nickname,
      target.role,
      admin.id,
    );

    await this.adminService.writeAuditLog({
      actorAdminId: admin.id,
      actorNickname: admin.nickname,
      action: 'IMPERSONATE_START',
      targetUserId: target.id,
      targetNickname: target.nickname,
      metadata: body?.reason ? { reason: body.reason.slice(0, 500) } : undefined,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']?.slice(0, 500) ?? null,
    });

    return {
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        target: {
          id: target.id,
          nickname: target.nickname,
          role: target.role,
        },
      },
    };
  }

  // ===== 分類管理 =====
  @Get('categories')
  async getCategories() {
    const data = await this.adminService.getCategories();
    return { data };
  }

  @Post('categories')
  async createCategory(
    @Body() body: { name: string; slug: string; sortOrder?: number; type?: CategoryType },
  ) {
    const data = await this.adminService.createCategory(body);
    return { data };
  }

  @Patch('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() body: { name?: string; slug?: string; sortOrder?: number; type?: CategoryType },
  ) {
    const data = await this.adminService.updateCategory(id, body);
    return { data };
  }

  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string) {
    await this.adminService.deleteCategory(id);
    return { data: { success: true } };
  }

  // ===== 看板管理 =====
  @Get('boards')
  async getBoards() {
    const data = await this.adminService.getBoards();
    return { data };
  }

  @Post('boards')
  async createBoard(
    @Body()
    body: {
      categoryId: string;
      name: string;
      slug: string;
      description?: string;
      icon?: string;
      sortOrder?: number;
    },
  ) {
    const data = await this.adminService.createBoard(body);
    return { data };
  }

  @Patch('boards/:id')
  async updateBoard(
    @Param('id') id: string,
    @Body()
    body: {
      categoryId?: string;
      name?: string;
      slug?: string;
      description?: string;
      icon?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const data = await this.adminService.updateBoard(id, body);
    return { data };
  }

  @Delete('boards/:id')
  async deleteBoard(@Param('id') id: string) {
    await this.adminService.deleteBoard(id);
    return { data: { success: true } };
  }

  // ===== 文章管理 =====
  @Roles(Role.MODERATOR) // 編輯人員可審文章 / 新聞
  @Get('posts')
  async getPosts(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('q') q?: string,
    @Query('boardId') boardId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('section') section?: 'NEWS' | 'FEATURED' | 'DISCUSSION',
    @Query('status') status?: 'DRAFT' | 'PUBLISHED',
    // 'true' 只看新聞 agent 自動發文、'false' 只看使用者/手動文章、未帶則全部
    @Query('isAutoPosted') isAutoPosted?: string,
  ) {
    const data = await this.adminService.getPosts({
      page,
      limit,
      q,
      boardId,
      categoryId,
      section:
        section === 'NEWS' || section === 'FEATURED' || section === 'DISCUSSION'
          ? section
          : undefined,
      status,
      isAutoPosted:
        isAutoPosted === 'true' ? true : isAutoPosted === 'false' ? false : undefined,
    });
    return { data };
  }

  // 依看板統計文章數（給看板篩選下拉顯示「待審 N」）。放在 :id 路由之前避免被吃掉。
  @Roles(Role.MODERATOR)
  @Get('posts/board-counts')
  async getBoardPostCounts(
    @Query('status') status?: 'DRAFT' | 'PUBLISHED',
    @Query('isAutoPosted') isAutoPosted?: string,
  ) {
    const data = await this.adminService.getBoardPostCounts({
      status: status === 'DRAFT' || status === 'PUBLISHED' ? status : undefined,
      isAutoPosted:
        isAutoPosted === 'true' ? true : isAutoPosted === 'false' ? false : undefined,
    });
    return { data };
  }

  @Roles(Role.MODERATOR) // 編輯人員可編輯 / 發布文章
  @Patch('posts/:id')
  async updatePost(
    @Param('id') id: string,
    @Body()
    body: {
      isPinned?: boolean;
      isLocked?: boolean;
      section?: 'NEWS' | 'FEATURED' | 'DISCUSSION';
      status?: 'DRAFT' | 'PUBLISHED';
      title?: string;
      content?: string;
      isAutoPosted?: boolean;
    },
  ) {
    const data = await this.adminService.updatePost(id, body);
    return { data };
  }

  @Roles(Role.MODERATOR) // 編輯人員可刪單篇文章（內容審核）
  @Delete('posts/:id')
  async deletePost(@Param('id') id: string) {
    await this.adminService.deletePost(id);
    return { data: { success: true } };
  }

  /**
   * 批次刪除文章（一鍵清空目前篩選結果）。
   * 強制要求帶 status，避免「沒帶條件就把所有文章清光」這種誤觸。
   * 其餘篩選（boardId / categoryId / section / q）與 GET /admin/posts 一致，
   * 所以前端可以直接把當前列表的篩選參數丟過來。
   */
  @Delete('posts')
  @Roles(Role.SUPER_ADMIN) // 一鍵刪除只開放給最高管理員，共管 ADMIN 不可
  async bulkDeletePosts(
    @Query('status') status: 'DRAFT' | 'PUBLISHED',
    @Query('boardId') boardId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('section') section?: 'NEWS' | 'FEATURED' | 'DISCUSSION',
    @Query('q') q?: string,
    // 限定只刪自動發文(true)或使用者文章(false)，避免新聞審核頁一鍵刪除誤刪使用者草稿
    @Query('isAutoPosted') isAutoPosted?: string,
  ) {
    const data = await this.adminService.bulkDeletePosts({
      status,
      boardId,
      categoryId,
      section:
        section === 'NEWS' || section === 'FEATURED' || section === 'DISCUSSION'
          ? section
          : undefined,
      q,
      isAutoPosted:
        isAutoPosted === 'true' ? true : isAutoPosted === 'false' ? false : undefined,
    });
    return { data };
  }

  // ===== 跑馬燈管理 =====
  @Get('marquees')
  async getMarquees() {
    const data = await this.adminService.getMarquees();
    return { data };
  }

  @Post('marquees')
  async createMarquee(@Body() body: { content: string; url?: string; sortOrder?: number }) {
    const data = await this.adminService.createMarquee(body);
    return { data };
  }

  @Patch('marquees/:id')
  async updateMarquee(
    @Param('id') id: string,
    @Body() body: { content?: string; url?: string; sortOrder?: number; isActive?: boolean },
  ) {
    const data = await this.adminService.updateMarquee(id, body);
    return { data };
  }

  @Delete('marquees/:id')
  async deleteMarquee(@Param('id') id: string) {
    await this.adminService.deleteMarquee(id);
    return { data: { success: true } };
  }

  // ===== 檢舉管理 =====
  @Roles(Role.MODERATOR) // 編輯人員可處理檢舉
  @Get('reports')
  async getReports(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const data = await this.adminService.getReports(page, limit);
    return { data };
  }

  @Roles(Role.MODERATOR) // 編輯人員可處理檢舉
  @Patch('reports/:id')
  async updateReport(
    @Param('id') id: string,
    @Body('status') status: 'RESOLVED' | 'DISMISSED',
  ) {
    const data = await this.adminService.updateReport(id, status);
    return { data };
  }

  // ===== 標籤管理 =====
  @Get('tags')
  async getTags() {
    const data = await this.adminService.getTags();
    return { data };
  }

  @Post('tags')
  async createTag(
    @Body() body: { name: string; slug: string; scope?: TagScope; sortOrder?: number },
  ) {
    const data = await this.adminService.createTag(body);
    return { data };
  }

  @Patch('tags/:id')
  async updateTag(
    @Param('id') id: string,
    @Body() body: { name?: string; slug?: string; scope?: TagScope; sortOrder?: number },
  ) {
    const data = await this.adminService.updateTag(id, body);
    return { data };
  }

  @Delete('tags/:id')
  async deleteTag(@Param('id') id: string) {
    await this.adminService.deleteTag(id);
    return { data: { success: true } };
  }

  // ===== 封鎖 IP 管理（可見性由權限矩陣控制，預設僅超級管理員） =====
  @Get('banned-ips')
  async getBannedIps() {
    const data = await this.adminService.getBannedIps();
    return { data };
  }

  @Post('banned-ips')
  async addBannedIp(@Body() body: { ip: string; reason?: string }) {
    const data = await this.adminService.addBannedIp(body.ip, body.reason);
    return { data };
  }

  @Delete('banned-ips/:id')
  async removeBannedIp(@Param('id') id: string) {
    await this.adminService.removeBannedIp(id);
    return { data: { success: true } };
  }

  // ===== 意見回報管理 =====
  @Roles(Role.MODERATOR) // 編輯人員可處理意見回報
  @Get('feedbacks')
  async getFeedbacks(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: FeedbackType,
    @Query('status') status?: FeedbackStatus,
  ) {
    const data = await this.adminService.getFeedbacks({ page, limit, type, status });
    return { data };
  }

  @Roles(Role.MODERATOR) // 編輯人員可看意見詳情
  @Get('feedbacks/:id')
  async getFeedbackById(@Param('id') id: string) {
    const data = await this.adminService.getFeedbackById(id);
    return { data };
  }

  @Post('feedbacks')
  async createFeedback(
    @CurrentUser('id') userId: string,
    @Body() body: { type: FeedbackType; title: string; content: string },
  ) {
    const data = await this.adminService.createFeedback(userId, body);
    return { data };
  }

  @Roles(Role.MODERATOR) // 編輯人員可更新意見狀態
  @Patch('feedbacks/:id/status')
  async updateFeedbackStatus(
    @Param('id') id: string,
    @Body('status') status: FeedbackStatus,
  ) {
    const data = await this.adminService.updateFeedbackStatus(id, status);
    return { data };
  }

  @Delete('feedbacks/:id')
  async deleteFeedback(@Param('id') id: string) {
    await this.adminService.deleteFeedback(id);
    return { data: { success: true } };
  }

  @Roles(Role.MODERATOR) // 編輯人員可回覆意見
  @Post('feedbacks/:id/replies')
  async createFeedbackReply(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('content') content: string,
  ) {
    const data = await this.adminService.createFeedbackReply(id, userId, content);
    return { data };
  }
}
