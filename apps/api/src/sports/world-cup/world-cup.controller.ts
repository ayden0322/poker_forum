import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WorldCupService, MatchListFilter } from './world-cup.service';

@ApiTags('FIFA World Cup 2026')
@Controller('sports/world-cup')
export class WorldCupController {
  constructor(private readonly svc: WorldCupService) {}

  @Get('matches')
  @ApiOperation({ summary: '世界盃賽程列表（可篩選 status/stage/group/date）' })
  async listMatches(
    @Query('status') status?: 'scheduled' | 'live' | 'finished',
    @Query('stage') stage?: 'group' | 'knockout',
    @Query('group') group?: string,
    @Query('date') date?: string,
  ) {
    const filter: MatchListFilter = {};
    if (status) filter.status = status;
    if (stage) filter.stage = stage;
    if (group) filter.group = group;
    if (date) filter.date = date;
    return { data: await this.svc.listMatches(filter) };
  }

  @Get('groups')
  @ApiOperation({ summary: '12 組積分榜' })
  async getGroups() {
    return { data: await this.svc.getGroupStandings() };
  }

  @Get('teams')
  @ApiOperation({ summary: '全 48 隊' })
  async listTeams() {
    return { data: await this.svc.listTeams() };
  }

  @Get('match/:id')
  @ApiOperation({ summary: '單場詳情' })
  async getMatch(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.svc.getMatch(id) };
  }
}
