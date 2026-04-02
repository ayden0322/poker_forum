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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../common/prisma.service';

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(
    private postsService: PostsService,
    private prisma: PrismaService,
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

  /** 取得文章詳情 */
  @Get(':id')
  async findById(@Param('id') id: string) {
    const data = await this.postsService.findById(id);
    return { data };
  }

  /** 發表文章 */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreatePostDto,
  ) {
    const data = await this.postsService.create(user.id, dto);
    return { data };
  }

  /** 編輯文章 */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
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
