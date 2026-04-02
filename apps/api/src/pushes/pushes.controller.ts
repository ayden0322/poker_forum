import { Controller, Post, Delete, Param, UseGuards, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PushesService } from './pushes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('pushes')
@Controller()
export class PushesController {
  constructor(private pushesService: PushesService) {}

  /** 檢查是否推過文章 */
  @Get('posts/:postId/push')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async checkPush(
    @Param('postId') postId: string,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.pushesService.getUserPushStatus(user.id, postId);
    return { data };
  }

  /** 推文章 */
  @Post('posts/:postId/push')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async pushPost(
    @Param('postId') postId: string,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.pushesService.pushPost(postId, user.id);
    return { data };
  }

  /** 取消推文章 */
  @Delete('posts/:postId/push')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async unpushPost(
    @Param('postId') postId: string,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.pushesService.unpushPost(postId, user.id);
    return { data };
  }

  /** 推回覆 */
  @Post('replies/:replyId/push')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async pushReply(
    @Param('replyId') replyId: string,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.pushesService.pushReply(replyId, user.id);
    return { data };
  }

  /** 取消推回覆 */
  @Delete('replies/:replyId/push')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async unpushReply(
    @Param('replyId') replyId: string,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.pushesService.unpushReply(replyId, user.id);
    return { data };
  }
}
