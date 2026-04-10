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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role, UserStatus, FeedbackType, FeedbackStatus } from '@betting-forum/database';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

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
    @Body() body: { role?: Role; status?: UserStatus },
  ) {
    const data = await this.adminService.updateMember(id, body);
    return { data };
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
    @Query('isAnnounce') isAnnounce?: string,
  ) {
    const data = await this.adminService.getPosts({
      page,
      limit,
      q,
      boardId,
      isAnnounce: isAnnounce === 'true' ? true : isAnnounce === 'false' ? false : undefined,
    });
    return { data };
  }

  @Patch('posts/:id')
  async updatePost(
    @Param('id') id: string,
    @Body() body: { isPinned?: boolean; isLocked?: boolean; isAnnounce?: boolean },
  ) {
    const data = await this.adminService.updatePost(id, body);
    return { data };
  }

  @Delete('posts/:id')
  async deletePost(@Param('id') id: string) {
    await this.adminService.deletePost(id);
    return { data: { success: true } };
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
