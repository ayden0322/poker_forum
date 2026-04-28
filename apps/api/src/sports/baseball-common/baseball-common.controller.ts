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
import { CpblStatsService, CPBL_LEADER_CATEGORIES, CpblLeaderCategory } from '../cpbl-stats/cpbl-stats.service';
import { NpbStatsService, NPB_LEADER_CATEGORIES, NpbLeaderCategory } from '../npb-stats/npb-stats.service';
import { KboStatsService, KBO_LEADER_CATEGORIES, KboLeaderCategory } from '../kbo-stats/kbo-stats.service';

/**
 * 通用棒球 API（CPBL / NPB / KBO）
 * 路由格式：/baseball/:league/...
 */
@ApiTags('棒球（通用）')
@Controller('baseball')
export class BaseballCommonController {
  constructor(
    private readonly baseballService: BaseballCommonService,
    private readonly cpblStats: CpblStatsService,
    private readonly npbStats: NpbStatsService,
    private readonly kboStats: KboStatsService,
  ) {}

  // ============ Generic 排行榜（CPBL/NPB/KBO 統一入口）============

  @Get(':league/leaders/:category')
  @ApiOperation({
    summary: '聯盟排行榜（依 league 自動路由：cpbl=爬 cpbl.com.tw、npb=爬 npb.jp、kbo=尚未實作）',
  })
  async getLeaders(
    @Param('league') league: string,
    @Param('category') category: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    if (league === 'cpbl') {
      if (!(category in CPBL_LEADER_CATEGORIES)) {
        return { success: false, data: [], meta: { league, category, message: '不支援的分類' } };
      }
      const data = await this.cpblStats.getLeaders(category as CpblLeaderCategory);
      const cfg = CPBL_LEADER_CATEGORIES[category as CpblLeaderCategory];
      return {
        success: data !== null,
        data: data ? data.slice(0, limit).map((d) => ({ ...d, league: '中華職棒' })) : [],
        meta: { league, category, label: cfg.label, unit: cfg.unit },
      };
    }

    if (league === 'npb') {
      if (!(category in NPB_LEADER_CATEGORIES)) {
        return { success: false, data: [], meta: { league, category, message: '不支援的分類' } };
      }
      const data = await this.npbStats.getLeaders(category as NpbLeaderCategory);
      const cfg = NPB_LEADER_CATEGORIES[category as NpbLeaderCategory];
      return {
        success: data !== null,
        data: data ? data.slice(0, limit) : [],
        meta: { league, category, label: cfg.label, unit: cfg.unit },
      };
    }

    if (league === 'kbo') {
      if (!(category in KBO_LEADER_CATEGORIES)) {
        return { success: false, data: [], meta: { league, category, message: '不支援的分類' } };
      }
      const data = await this.kboStats.getLeaders(category as KboLeaderCategory);
      const cfg = KBO_LEADER_CATEGORIES[category as KboLeaderCategory];
      return {
        success: data !== null,
        data: data ? data.slice(0, limit).map((d) => ({ ...d, league: '韓國職棒' })) : [],
        meta: { league, category, label: cfg.label, unit: cfg.unit },
      };
    }

    return { success: false, data: [], meta: { message: '不支援的聯盟' } };
  }

  @Get(':league/news')
  @ApiOperation({ summary: '聯盟最新公告動態（cpbl=cpbl.com.tw/news、npb=npb.jp/news）' })
  async getNews(
    @Param('league') league: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    if (league === 'cpbl') {
      const data = await this.cpblStats.getNews(limit);
      return { success: data !== null, data: data ?? [] };
    }
    if (league === 'npb') {
      const data = await this.npbStats.getNews(limit);
      return { success: data !== null, data: data ?? [] };
    }
    if (league === 'kbo') {
      const data = await this.kboStats.getNews(limit);
      return { success: data !== null, data: data ?? [] };
    }
    return { success: false, data: [] };
  }

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
