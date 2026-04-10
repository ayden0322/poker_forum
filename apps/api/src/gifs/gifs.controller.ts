import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { GifsService } from './gifs.service';
import { Throttle } from '@nestjs/throttler';

@Controller('gifs')
export class GifsController {
  constructor(private readonly gifsService: GifsService) {}

  /** GET /gifs/search?q=funny&offset=0&limit=20 */
  @Get('search')
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  async search(
    @Query('q') q: string,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    if (!q?.trim()) return { data: [] };
    const data = await this.gifsService.search(q.trim(), offset, Math.min(limit, 50));
    return { data };
  }

  /** GET /gifs/trending?offset=0&limit=20 */
  @Get('trending')
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  async trending(
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const data = await this.gifsService.trending(offset, Math.min(limit, 50));
    return { data };
  }
}
