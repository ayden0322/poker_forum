import {
  Controller,
  Get,
  Param,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BoardsService } from './boards.service';

@ApiTags('boards')
@Controller('boards')
export class BoardsController {
  constructor(private boardsService: BoardsService) {}

  /** 取得跑馬燈 */
  @Get('marquees')
  async getMarquees() {
    const data = await this.boardsService.getActiveMarquees();
    return { data };
  }

  /** 取得所有分類與看板 */
  @Get('categories')
  async getCategories() {
    const data = await this.boardsService.getCategoriesWithBoards();
    return { data };
  }

  /** 取得單一看板資訊 */
  @Get(':slug')
  async getBoard(@Param('slug') slug: string) {
    const data = await this.boardsService.getBoardBySlug(slug);
    return { data };
  }

  /** 取得看板文章列表 */
  @Get(':slug/posts')
  async getBoardPosts(
    @Param('slug') slug: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('sort', new DefaultValuePipe('latest')) sort: 'latest' | 'popular' | 'lastReply',
    @Query('tag') tag?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.boardsService.getBoardPosts(slug, { page, limit, sort, tag, search });
    return { data };
  }
}
