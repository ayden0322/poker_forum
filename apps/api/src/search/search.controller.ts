import { Controller, Get, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  /** 統一搜尋：區塊、分類、文章 */
  @Get()
  async search(
    @Query('q') q: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const data = await this.searchService.searchAll({
      q: q ?? '',
      page: page!,
      limit: Math.min(limit!, 100),
    });
    return { data };
  }
}
