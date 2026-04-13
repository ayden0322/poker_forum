import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SportsService } from './sports.service';
import { VALID_BOARD_SLUGS } from './sports.config';

@ApiTags('體育賽事')
@Controller('sports')
export class SportsController {
  constructor(private readonly sportsService: SportsService) {}

  @Get(':boardSlug/live')
  @ApiOperation({ summary: '取得今日賽事與即時比分' })
  async getLive(@Param('boardSlug') boardSlug: string) {
    this.validateBoardSlug(boardSlug);
    const data = await this.sportsService.getLiveGames(boardSlug);
    return { data: data ?? [] };
  }

  @Get(':boardSlug/recent')
  @ApiOperation({ summary: '取得昨日+今日+明日三天賽事' })
  async getRecent(@Param('boardSlug') boardSlug: string) {
    this.validateBoardSlug(boardSlug);
    const data = await this.sportsService.getRecentGames(boardSlug);
    return { data };
  }

  @Get(':boardSlug/schedule')
  @ApiOperation({ summary: '取得近期賽程' })
  async getSchedule(@Param('boardSlug') boardSlug: string) {
    this.validateBoardSlug(boardSlug);
    const data = await this.sportsService.getSchedule(boardSlug);
    return { data: data ?? [] };
  }

  @Get(':boardSlug/standings')
  @ApiOperation({ summary: '取得聯盟排名' })
  async getStandings(@Param('boardSlug') boardSlug: string) {
    this.validateBoardSlug(boardSlug);
    const data = await this.sportsService.getStandings(boardSlug);
    return { data: data ?? [] };
  }

  @Get(':boardSlug/players')
  @ApiOperation({ summary: '取得球員數據' })
  async getPlayers(
    @Param('boardSlug') boardSlug: string,
    @Query('teamId', new DefaultValuePipe(0), ParseIntPipe) teamId: number,
  ) {
    this.validateBoardSlug(boardSlug);
    const data = await this.sportsService.getPlayers(
      boardSlug,
      teamId || undefined,
    );
    return { data: data ?? [] };
  }

  @Get(':boardSlug/odds')
  @ApiOperation({ summary: '取得賠率資訊（僅足球）' })
  async getOdds(
    @Param('boardSlug') boardSlug: string,
    @Query('fixtureId', new DefaultValuePipe(0), ParseIntPipe) fixtureId: number,
  ) {
    this.validateBoardSlug(boardSlug);
    const data = await this.sportsService.getOdds(
      boardSlug,
      fixtureId || undefined,
    );
    return { data: data ?? [] };
  }

  private validateBoardSlug(slug: string) {
    if (!VALID_BOARD_SLUGS.includes(slug)) {
      throw new BadRequestException(
        `無效的看板代碼，支援的看板：${VALID_BOARD_SLUGS.join(', ')}`,
      );
    }
  }
}
