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
import { Roles } from '../common/decorators/roles.decorator';
import { Role, UserStatus, FeedbackType, FeedbackStatus } from '@betting-forum/database';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { getClientIp } from '../common/get-client-ip.util';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private authService: AuthService,
  ) {}

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
  ) {
    const data = await this.adminService.getMembers({ page, limit, q, status, role });
    return { data };
  }

  @Patch('members/:id')
  async updateMember(
    @Param('id') id: string,
    @Body()
    body: {
      role?: Role;
      status?: UserStatus;
      phoneVerified?: boolean;
      phoneVerificationBypass?: boolean;
      phoneVerificationBypassReason?: string | null;
    },
  ) {
    const data = await this.adminService.updateMember(id, body);
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
  async createCategory(@Body() body: { name: string; slug: string; sortOrder?: number }) {
    const data = await this.adminService.createCategory(body);
    return { data };
  }

  @Patch('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() body: { name?: string; slug?: string; sortOrder?: number },
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
  @Get('posts')
  async getPosts(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('q') q?: string,
    @Query('boardId') boardId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('section') section?: 'FEATURED' | 'DISCUSSION',
    @Query('status') status?: 'DRAFT' | 'PUBLISHED',
  ) {
    const data = await this.adminService.getPosts({
      page,
      limit,
      q,
      boardId,
      categoryId,
      section: section === 'FEATURED' || section === 'DISCUSSION' ? section : undefined,
      status,
    });
    return { data };
  }

  @Patch('posts/:id')
  async updatePost(
    @Param('id') id: string,
    @Body()
    body: {
      isPinned?: boolean;
      isLocked?: boolean;
      section?: 'FEATURED' | 'DISCUSSION';
      status?: 'DRAFT' | 'PUBLISHED';
      title?: string;
      content?: string;
      isAutoPosted?: boolean;
    },
  ) {
    const data = await this.adminService.updatePost(id, body);
    return { data };
  }

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
  async bulkDeletePosts(
    @Query('status') status: 'DRAFT' | 'PUBLISHED',
    @Query('boardId') boardId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('section') section?: 'FEATURED' | 'DISCUSSION',
    @Query('q') q?: string,
  ) {
    const data = await this.adminService.bulkDeletePosts({
      status,
      boardId,
      categoryId,
      section: section === 'FEATURED' || section === 'DISCUSSION' ? section : undefined,
      q,
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
  @Get('reports')
  async getReports(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const data = await this.adminService.getReports(page, limit);
    return { data };
  }

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
  async createTag(@Body() body: { name: string; slug: string }) {
    const data = await this.adminService.createTag(body);
    return { data };
  }

  @Patch('tags/:id')
  async updateTag(@Param('id') id: string, @Body() body: { name?: string; slug?: string }) {
    const data = await this.adminService.updateTag(id, body);
    return { data };
  }

  @Delete('tags/:id')
  async deleteTag(@Param('id') id: string) {
    await this.adminService.deleteTag(id);
    return { data: { success: true } };
  }

  // ===== 封鎖 IP 管理 =====
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
