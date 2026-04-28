import { Controller, Get, Param, Query, ParseIntPipe, DefaultValuePipe, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CpblStatsService, CPBL_LEADER_CATEGORIES, CpblLeaderCategory } from './cpbl-stats.service';

/**
 * CPBL 專屬 API（資料來源：CPBL 官方網站）
 *
 * 提供 Box Score、逐局比分、打擊/投球統計等官方資料
 * 比 API-Sports 的通用資料更完整、更即時
 */
@ApiTags('CPBL')
@Controller('cpbl')
export class CpblStatsController {
  constructor(private cpblStats: CpblStatsService) {}

  // ============ Box Score ============

  @Get('games/:gameSno/boxscore')
  @ApiOperation({
    summary: '取得單場 CPBL Box Score（打擊、投球、逐局比分、逐球紀錄）',
    description: '資料來源：CPBL 官方網站。含完整打擊與投球統計、逐局比分、逐球紀錄',
  })
  @ApiParam({ name: 'gameSno', description: 'CPBL 比賽序號' })
  @ApiQuery({ name: 'year', required: false, description: '西元年份（預設今年）' })
  @ApiQuery({ name: 'kindCode', required: false, description: '比賽類型：A=例行賽, B=季後賽, C=總冠軍賽' })
  async getBoxScore(
    @Param('gameSno', ParseIntPipe) gameSno: number,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number,
    @Query('kindCode', new DefaultValuePipe('A')) kindCode: string,
  ) {
    const data = await this.cpblStats.getBoxScore(gameSno, year, kindCode);
    if (!data) {
      return { success: false, message: `找不到比賽資料（GameSno=${gameSno}）`, data: null };
    }
    return { success: true, data };
  }

  // ============ 賽程表 ============

  @Get('schedule')
  @ApiOperation({
    summary: '取得 CPBL 賽程表（指定月份）',
    description: '回傳含 GameSno 的賽程表，可用 GameSno 查詢 Box Score',
  })
  @ApiQuery({ name: 'year', required: false, description: '西元年份（預設今年）' })
  @ApiQuery({ name: 'month', required: false, description: '月份 1-12（預設當月）' })
  @ApiQuery({ name: 'kindCode', required: false, description: '比賽類型：A=例行賽' })
  async getSchedule(
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number,
    @Query('month', new DefaultValuePipe(new Date().getMonth() + 1), ParseIntPipe) month: number,
    @Query('kindCode', new DefaultValuePipe('A')) kindCode: string,
  ) {
    const data = await this.cpblStats.getSchedule(year, month, kindCode);
    return { success: true, data: data ?? [] };
  }

  // ============ 今日比賽 ============

  @Get('today')
  @ApiOperation({
    summary: '取得今日 CPBL 比賽（台灣時間）',
    description: '回傳今日賽程含 GameSno，方便前端串接 Box Score',
  })
  async getTodayGames() {
    const data = await this.cpblStats.getTodayGames();
    return { success: true, data };
  }

  // ============ 排行榜（B2）============

  @Get('leaders/:category')
  @ApiOperation({
    summary: 'CPBL 賽季排行榜',
    description: '分類：battingAverage / hits / homeRuns / rbi / stolenBases / era / wins / saves / holds / strikeouts',
  })
  @ApiParam({ name: 'category', description: '排行榜分類' })
  @ApiQuery({ name: 'year', required: false, description: '西元年份（預設今年）' })
  @ApiQuery({ name: 'kindCode', required: false, description: '比賽類型：A=例行賽（預設）' })
  @ApiQuery({ name: 'limit', required: false, description: '回傳前 N 名（預設 10）' })
  async getLeaders(
    @Param('category') category: string,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number,
    @Query('kindCode', new DefaultValuePipe('A')) kindCode: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    if (!(category in CPBL_LEADER_CATEGORIES)) {
      const supported = Object.keys(CPBL_LEADER_CATEGORIES).join(', ');
      throw new BadRequestException(`無效的分類「${category}」，支援：${supported}`);
    }

    const leaders = await this.cpblStats.getLeaders(
      category as CpblLeaderCategory,
      year,
      kindCode,
    );

    return {
      success: leaders !== null,
      data: leaders ? leaders.slice(0, limit) : [],
      meta: {
        category,
        year,
        kindCode,
        unit: CPBL_LEADER_CATEGORIES[category as CpblLeaderCategory].unit,
        label: CPBL_LEADER_CATEGORIES[category as CpblLeaderCategory].label,
      },
    };
  }

  // ============ 球員個人頁（B4）============

  @Get('players/:acnt')
  @ApiOperation({
    summary: 'CPBL 球員個人資料 + 賽季/生涯統計',
    description: '自動判斷打者/投手，回傳對應的 stats',
  })
  @ApiParam({ name: 'acnt', description: 'CPBL 球員帳號（10 位數字字串）' })
  @ApiQuery({ name: 'kindCode', required: false, description: 'A=一軍, B=二軍（預設 A）' })
  async getPlayer(
    @Param('acnt') acnt: string,
    @Query('kindCode', new DefaultValuePipe('A')) kindCode: string,
  ) {
    const data = await this.cpblStats.getPlayer(acnt, kindCode);
    if (!data) {
      return { success: false, message: `找不到球員資料（acnt=${acnt}）`, data: null };
    }
    return { success: true, data };
  }

  // ============ CPBL 公告新聞（B3）============

  @Get('news')
  @ApiOperation({
    summary: 'CPBL 最新公告（合約異動、延賽、引退、傷兵相關等）',
    description: '抓 cpbl.com.tw/news 列表前 N 則',
  })
  @ApiQuery({ name: 'limit', required: false, description: '回傳前 N 則（預設 10）' })
  async getNews(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const data = await this.cpblStats.getNews(limit);
    return { success: data !== null, data: data ?? [] };
  }

  // ============ 診斷工具 ============

  @Get('debug/connectivity')
  @ApiOperation({
    summary: 'CPBL 官網連線診斷（B0）',
    description: '測試 /box、/schedule、callScheduleApi 三個步驟，回傳每步耗時與錯誤詳情',
  })
  async diagnose() {
    const data = await this.cpblStats.diagnose();
    return { data };
  }
}
