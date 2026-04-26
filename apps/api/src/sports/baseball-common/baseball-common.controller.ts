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
import { BaseballCommonService } from './baseball-common.service';
import { BaseballLeague, LEAGUE_DISPLAY_NAME } from './baseball-common.types';

/**
 * 通用棒球 API（CPBL / NPB / KBO）
 * 路由格式：/baseball/:league/...
 */
@ApiTags('棒球（通用）')
@Controller('baseball')
export class BaseballCommonController {
  constructor(private readonly baseballService: BaseballCommonService) {}

  // ============ 比賽 ============

  @Get(':league/games')
  @ApiOperation({ summary: '取得指定日期的比賽' })
  async getGames(
    @Param('league') league: string,
    @Query('date') date?: string,
  ) {
    this.validateLeague(league);
    const targetDate = date ?? this.getTaiwanToday();
    const data = await this.baseballService.getGamesByDate(league as BaseballLeague, targetDate);
    return { data };
  }

  @Get(':league/games/tw')
  @ApiOperation({ summary: '台灣時區視角的比賽（含即時比分）' })
  async getGamesTw(
    @Param('league') league: string,
    @Query('date') date?: string,
  ) {
    this.validateLeague(league);
    const data = await this.baseballService.getScheduleTw(league as BaseballLeague, date);
    return { data };
  }

  @Get(':league/games/recent')
  @ApiOperation({ summary: '三日賽事（昨日/今日/明日，台灣時區）' })
  async getRecentGames(@Param('league') league: string) {
    this.validateLeague(league);
    const data = await this.baseballService.getRecentGamesTw(league as BaseballLeague);
    return { data };
  }

  @Get(':league/games/:gameId')
  @ApiOperation({ summary: '取得單場比賽資料' })
  async getGame(
    @Param('league') league: string,
    @Param('gameId', ParseIntPipe) gameId: number,
  ) {
    this.validateLeague(league);
    const data = await this.baseballService.getGame(gameId);
    return { data };
  }

  // ============ 排名 ============

  @Get(':league/standings')
  @ApiOperation({ summary: '取得聯盟排名' })
  async getStandings(@Param('league') league: string) {
    this.validateLeague(league);
    const data = await this.baseballService.getStandings(league as BaseballLeague);
    return { data: data ?? [] };
  }

  // ============ 球隊 ============

  @Get(':league/teams')
  @ApiOperation({ summary: '取得球隊列表（含中文名）' })
  async getTeams(@Param('league') league: string) {
    this.validateLeague(league);
    const data = await this.baseballService.getTeams(league as BaseballLeague);
    return { data: data ?? [] };
  }

  @Get(':league/teams/:teamId/overview')
  @ApiOperation({ summary: '球隊完整資料（球隊資訊 + 近期賽事 + 聯盟排名）' })
  async getTeamOverview(
    @Param('league') league: string,
    @Param('teamId', ParseIntPipe) teamId: number,
  ) {
    this.validateLeague(league);
    const data = await this.baseballService.getTeamOverview(league as BaseballLeague, teamId);
    return { data };
  }

  @Get(':league/teams/:teamId/recent')
  @ApiOperation({ summary: '球隊近期比賽' })
  async getTeamRecent(
    @Param('league') league: string,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Query('days', new DefaultValuePipe(14), ParseIntPipe) days: number,
  ) {
    this.validateLeague(league);
    const data = await this.baseballService.getTeamRecentGames(
      league as BaseballLeague,
      teamId,
      days,
    );
    return { data };
  }

  @Get(':league/teams/:teamId/h2h/:opponentId')
  @ApiOperation({ summary: '兩隊歷史對戰（近 N 場已結束比賽）' })
  async getHeadToHead(
    @Param('league') league: string,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('opponentId', ParseIntPipe) opponentId: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    this.validateLeague(league);
    const data = await this.baseballService.getHeadToHead(
      league as BaseballLeague,
      teamId,
      opponentId,
      { limit },
    );
    return { data };
  }

  // ============ 球員 ============

  @Get(':league/players')
  @ApiOperation({ summary: '取得球員名單' })
  async getPlayers(
    @Param('league') league: string,
    @Query('teamId', new DefaultValuePipe(0), ParseIntPipe) teamId: number,
  ) {
    this.validateLeague(league);
    const data = await this.baseballService.getPlayers(
      league as BaseballLeague,
      teamId || undefined,
    );
    return { data: data ?? [] };
  }

  // ============ 工具 ============

  private validateLeague(league: string) {
    if (!this.baseballService.isValidLeague(league)) {
      const supported = Object.entries(LEAGUE_DISPLAY_NAME)
        .map(([k, v]) => `${k}(${v})`)
        .join(', ');
      throw new BadRequestException(
        `無效的棒球聯賽代碼「${league}」，支援：${supported}`,
      );
    }
  }

  private getTaiwanToday(): string {
    const tw = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    return tw.toISOString().slice(0, 10);
  }
}
