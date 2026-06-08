import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FriendliesService, FriendlyListFilter } from './friendlies.service';

@ApiTags('國際足球友誼賽 2026')
@Controller('sports/friendlies')
export class FriendliesController {
  constructor(private readonly svc: FriendliesService) {}

  @Get('matches')
  @ApiOperation({ summary: '友誼賽賽程列表（可篩選 status/featured/date/from/to）' })
  async listMatches(
    @Query('status') status?: 'scheduled' | 'live' | 'finished',
    @Query('featured') featured?: string,
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const filter: FriendlyListFilter = {};
    if (status) filter.status = status;
    if (featured !== undefined) filter.featured = featured === 'true' || featured === '1';
    if (date) filter.date = date;
    if (from) filter.from = from;
    if (to) filter.to = to;
    if (limit) filter.limit = Number(limit);
    return { data: await this.svc.listMatches(filter) };
  }

  @Get('timeline')
  @ApiOperation({ summary: '按台灣日期分段的賽程時間軸（板塊主視覺）' })
  async timeline(
    @Query('status') status?: 'scheduled' | 'live' | 'finished',
    @Query('featured') featured?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const filter: FriendlyListFilter = {};
    if (status) filter.status = status;
    if (featured !== undefined) filter.featured = featured === 'true' || featured === '1';
    if (from) filter.from = from;
    if (to) filter.to = to;
    if (limit) filter.limit = Number(limit);
    return { data: await this.svc.listByDate(filter) };
  }

  @Get('overview')
  @ApiOperation({ summary: '賽季概況（本季 X 場 · 今日 Y 場 · LIVE Z 場）' })
  async overview() {
    return { data: await this.svc.getOverview() };
  }

  @Get('match/:id')
  @ApiOperation({ summary: '單場詳情' })
  async getMatch(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.svc.getMatch(id) };
  }
}
