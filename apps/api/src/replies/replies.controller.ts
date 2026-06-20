import {
  Controller, Get, Post, Patch, Delete,
  Param, Query, Body, UseGuards,
  DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RepliesService } from './replies.service';
import { CreateReplyDto } from './dto/create-reply.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PhoneVerifiedGuard } from '../common/guards/phone-verified.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TasksService } from '../tasks/tasks.service';

@ApiTags('replies')
@Controller()
export class RepliesController {
  constructor(
    private repliesService: RepliesService,
    private tasks: TasksService,
  ) {}

  /** 取得文章回覆 */
  @Get('posts/:postId/replies')
  async findByPost(
    @Param('postId') postId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const data = await this.repliesService.findByPostId(postId, page, limit);
    return { data };
  }

  /** 新增回覆 */
  @Post('posts/:postId/replies')
  @UseGuards(JwtAuthGuard, PhoneVerifiedGuard)
  @ApiBearerAuth()
  async create(
    @Param('postId') postId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateReplyDto,
  ) {
    const data = await this.repliesService.create(postId, user.id, dto);
    // 回覆任務：以「不同文章」計數（同篇多次回覆當天只算一次）
    await this.tasks.recordEvent(user.id, 'REPLY', postId);
    return { data };
  }

  /** 編輯回覆 */
  @Patch('replies/:id')
  @UseGuards(JwtAuthGuard, PhoneVerifiedGuard)
  @ApiBearerAuth()
  async update(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
    @Body('content') content: string,
  ) {
    const data = await this.repliesService.update(id, user.id, user.role as any, content);
    return { data };
  }

  /** 刪除回覆 */
  @Delete('replies/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    const data = await this.repliesService.remove(id, user.id, user.role as any);
    return { data };
  }
}
