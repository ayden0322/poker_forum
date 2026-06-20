import {
  Controller, Get, Post, Patch, Delete,
  Param, Query, Body, UseGuards,
  DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { CreateReportDto } from './dto/report.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { PhoneVerifiedGuard } from '../common/guards/phone-verified.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../common/prisma.service';
import { TasksService } from '../tasks/tasks.service';

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(
    private postsService: PostsService,
    private prisma: PrismaService,
    private tasks: TasksService,
  ) {}

  /** 搜尋文章 */
  @Get('search')
  async search(
    @Query('q') q: string,
    @Query('boardId') boardId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const data = await this.postsService.search({ q, boardId, page: page!, limit: Math.min(limit!, 100) });
    return { data };
  }

  /**
   * 取得文章詳情（可選登入）。
   * 註：前端文章頁為 SSR 匿名抓取，這裡的 recordEvent 實務上不會觸發；
   * 真正的「瀏覽計入任務」由前端登入後呼叫 POST :id/view（見下）。此處保留以涵蓋帶 token 直打 API 的情況。
   */
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async findById(@Param('id') id: string, @CurrentUser() user: { id: string } | null) {
    const data = await this.postsService.findById(id);
    if (user?.id) await this.tasks.recordEvent(user.id, 'VIEW_POSTS', id);
    return { data };
  }

  /**
   * 記錄「已瀏覽此文」以推進每日任務（VIEW_POSTS）。
   * 因文章詳情頁是 SSR 匿名抓取，瀏覽事件改由前端登入後主動回報。
   * recordEvent 內建總開關（關閉時 no-op）、同篇當日去重、永不丟錯。
   */
  @Post(':id/view')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async recordView(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    await this.tasks.recordEvent(user.id, 'VIEW_POSTS', id);
    return { data: { ok: true } };
  }

  /** 發表文章 */
  @Post()
  @UseGuards(JwtAuthGuard, PhoneVerifiedGuard)
  @ApiBearerAuth()
  async create(
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: CreatePostDto,
  ) {
    const data = await this.postsService.create(user.id, user.role, dto);
    await this.tasks.recordEvent(user.id, 'CREATE_POST', data.id);
    return { data };
  }

  /** 編輯文章 */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, PhoneVerifiedGuard)
  @ApiBearerAuth()
  async update(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: UpdatePostDto,
  ) {
    const data = await this.postsService.update(id, user.id, user.role as any, dto);
    return { data };
  }

  /** 刪除文章 */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    const data = await this.postsService.remove(id, user.id, user.role as any);
    return { data };
  }

  /** 檢舉 */
  @Post('reports')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async report(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateReportDto,
  ) {
    const data = await this.prisma.report.create({
      data: {
        reporterId: user.id,
        postId: dto.postId ?? null,
        replyId: dto.replyId ?? null,
        reason: dto.reason,
      },
    });
    return { data };
  }
}
