import {
  Controller, Get, Post, Delete, Param, Query, UseGuards,
  DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BookmarksService } from './bookmarks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('bookmarks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookmarks')
export class BookmarksController {
  constructor(private bookmarksService: BookmarksService) {}

  @Get()
  async getMyBookmarks(
    @CurrentUser() user: { id: string },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const data = await this.bookmarksService.getUserBookmarks(user.id, page, limit);
    return { data };
  }

  @Get(':postId')
  async checkBookmark(
    @Param('postId') postId: string,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.bookmarksService.checkBookmark(user.id, postId);
    return { data };
  }

  @Post(':postId')
  async addBookmark(
    @Param('postId') postId: string,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.bookmarksService.addBookmark(user.id, postId);
    return { data };
  }

  @Delete(':postId')
  async removeBookmark(
    @Param('postId') postId: string,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.bookmarksService.removeBookmark(user.id, postId);
    return { data };
  }
}
