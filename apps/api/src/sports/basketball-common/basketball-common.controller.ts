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
import { BasketballCommonService } from './basketball-common.service';
import { listApiSportsBasketballLeagues } from './basketball-common.types';
import { LEAGUE_CONFIG } from '../sports.config';

/**
 * 通用籃球 API（API-Sports 籃球聯賽）
 * 路由格式：/basketball/:league/...
 *
 * 能力驅動：前端先打 GET /basketball/:league/config 取得 capabilities，
 * 再決定要渲染哪些 widget（賽程/排行/球員/賠率/box score）。
 */
@ApiTags('籃球（通用）')
@Controller('basketball')
export class BasketballCommonController {
  constructor(private readonly basketball: BasketballCommonService) {}

  // ============ 能力宣告（前端據此決定顯示哪些 widget）============

  @Get(':league/config')
  @ApiOperation({ summary: '取得聯賽設定與能力宣告（capabilities）' })
  async getConfig(@Param('league') league: string) {
    this.validateLeague(league);
    const cfg = LEAGUE_CONFIG[league];
    return {
      data: {
        slug: league,
        displayName: cfg.displayName,
        dataSource: cfg.dataSource ?? 'apisports',
        leagueId: cfg.leagueId,
        season: String(cfg.season),
        capabilities: cfg.capabilities ?? null,
      },
    };
  }

  // ============ 比賽 ============

  @Get(':league/games')
  @ApiOperation({ summary: '取得指定日期的比賽（預設台灣今日）' })
  async getGames(@Param('league') league: string, @Query('date') date?: string) {
    this.validateLeague(league);
    const targetDate = date ?? this.getTaiwanToday();
    const data = await this.basketball.getGamesByDate(league, targetDate);
    return { data };
  }

  @Get(':league/games/recent')
  @ApiOperation({ summary: '三日賽事（昨日/今日/明日，台灣時區）' })
  async getRecentGames(@Param('league') league: string) {
    this.validateLeague(league);
    const data = await this.basketball.getRecentGamesTw(league);
    return { data };
  }

  @Get(':league/schedule')
  @ApiOperation({ summary: '全季賽程（SSR 賽程頁用）' })
  async getSchedule(@Param('league') league: string) {
    this.validateLeague(league);
    const data = await this.basketball.getSeasonSchedule(league);
    return { data };
  }

  @Get(':league/games/:gameId')
  @ApiOperation({ summary: '取得單場比賽資料' })
  async getGame(
    @Param('league') league: string,
    @Param('gameId', ParseIntPipe) gameId: number,
  ) {
    this.validateLeague(league);
    const data = await this.basketball.getGame(league, gameId);
    return { data };
  }

  @Get(':league/games/:gameId/boxscore')
  @ApiOperation({ summary: '單場 box score（球隊+球員統計，需 capabilities.boxScore）' })
  async getBoxScore(
    @Param('league') league: string,
    @Param('gameId', ParseIntPipe) gameId: number,
  ) {
    this.validateLeague(league);
    const data = await this.basketball.getBoxScore(league, gameId);
    return { data };
  }

  // ============ 排名 ============

  @Get(':league/standings')
  @ApiOperation({ summary: '取得聯盟排名' })
  async getStandings(@Param('league') league: string) {
    this.validateLeague(league);
    const data = await this.basketball.getStandings(league);
    return { data: data ?? [] };
  }

  // ============ 球隊 ============

  @Get(':league/teams')
  @ApiOperation({ summary: '取得球隊列表（含中文名）' })
  async getTeams(@Param('league') league: string) {
    this.validateLeague(league);
    const data = await this.basketball.getTeams(league);
    return { data: data ?? [] };
  }

  @Get(':league/teams/:teamId/overview')
  @ApiOperation({ summary: '球隊完整資料（球隊資訊 + 近期賽事 + 聯盟排名）' })
  async getTeamOverview(
    @Param('league') league: string,
    @Param('teamId', ParseIntPipe) teamId: number,
  ) {
    this.validateLeague(league);
    const data = await this.basketball.getTeamOverview(league, teamId);
    return { data };
  }

  @Get(':league/teams/:teamId/recent')
  @ApiOperation({ summary: '球隊近期比賽' })
  async getTeamRecent(
    @Param('league') league: string,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    this.validateLeague(league);
    const data = await this.basketball.getTeamRecentGames(league, teamId, days);
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
    const data = await this.basketball.getHeadToHead(league, teamId, opponentId, { limit });
    return { data };
  }

  // ============ 球員 ============

  @Get(':league/players')
  @ApiOperation({ summary: '取得球隊球員名單（需帶 teamId，需 capabilities.players）' })
  async getPlayers(
    @Param('league') league: string,
    @Query('teamId', new DefaultValuePipe(0), ParseIntPipe) teamId: number,
  ) {
    this.validateLeague(league);
    const data = await this.basketball.getPlayers(league, teamId || undefined);
    return { data: data ?? [] };
  }

  // ============ 賠率 ============

  @Get(':league/odds')
  @ApiOperation({ summary: '取得賠率（需 capabilities.odds；可帶 gameId 查單場）' })
  async getOdds(
    @Param('league') league: string,
    @Query('gameId', new DefaultValuePipe(0), ParseIntPipe) gameId: number,
  ) {
    this.validateLeague(league);
    const data = await this.basketball.getOdds(league, gameId || undefined);
    return { data: data ?? null };
  }

  // ============ 工具 ============

  private validateLeague(league: string) {
    if (!this.basketball.isValidLeague(league)) {
      const supported = listApiSportsBasketballLeagues()
        .map((s) => `${s}(${LEAGUE_CONFIG[s]?.displayName ?? s})`)
        .join(', ');
      throw new BadRequestException(
        `無效的籃球聯賽代碼「${league}」，支援：${supported}`,
      );
    }
  }

  private getTaiwanToday(): string {
    const tw = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    return tw.toISOString().slice(0, 10);
  }
}
