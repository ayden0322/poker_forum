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
import { VALID_SPORT_TYPES, SportType } from './sports.config';

@ApiTags('體育賽事')
@Controller('sports')
export class SportsController {
  constructor(private readonly sportsService: SportsService) {}

  @Get(':type/live')
  @ApiOperation({ summary: '取得今日賽事與即時比分' })
  async getLive(@Param('type') type: string) {
    this.validateType(type);
    const data = await this.sportsService.getLiveGames(type as SportType);
    return { data: data ?? [] };
  }

  @Get(':type/schedule')
  @ApiOperation({ summary: '取得近期賽程' })
  async getSchedule(@Param('type') type: string) {
    this.validateType(type);
    const data = await this.sportsService.getSchedule(type as SportType);
    return { data: data ?? [] };
  }

  @Get(':type/standings')
  @ApiOperation({ summary: '取得聯盟排名' })
  async getStandings(@Param('type') type: string) {
    this.validateType(type);
    const data = await this.sportsService.getStandings(type as SportType);
    return { data: data ?? [] };
  }

  @Get(':type/players')
  @ApiOperation({ summary: '取得球員數據' })
  async getPlayers(
    @Param('type') type: string,
    @Query('teamId', new DefaultValuePipe(0), ParseIntPipe) teamId: number,
  ) {
    this.validateType(type);
    const data = await this.sportsService.getPlayers(
      type as SportType,
      teamId || undefined,
    );
    return { data: data ?? [] };
  }

  @Get(':type/odds')
  @ApiOperation({ summary: '取得賠率資訊（僅足球）' })
  async getOdds(
    @Param('type') type: string,
    @Query('fixtureId', new DefaultValuePipe(0), ParseIntPipe) fixtureId: number,
  ) {
    this.validateType(type);
    const data = await this.sportsService.getOdds(
      type as SportType,
      fixtureId || undefined,
    );
    return { data: data ?? [] };
  }

  private validateType(type: string) {
    if (!VALID_SPORT_TYPES.includes(type as SportType)) {
      throw new BadRequestException(
        `無效的運動類型，請使用：${VALID_SPORT_TYPES.join(', ')}`,
      );
    }
  }
}
