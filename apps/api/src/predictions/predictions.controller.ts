// P幣競猜 — 下注/注單 API（規格 §3.1）
// fail-closed：PREDICTION_ENABLED 未開時回 enabled:false，不洩漏功能存在與否的細節。

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BetsService } from './bets.service';
import { MarketsService } from './markets.service';
import { LeaderboardService } from './leaderboard.service';
import { isPredictionEnabled } from './prediction.flags';

class PlaceBetDto {
  @IsString() matchId!: string;
  @IsIn(['WINLOSE', 'OVER_UNDER']) market!: 'WINLOSE' | 'OVER_UNDER';
  @IsIn(['HOME', 'DRAW', 'AWAY', 'OVER', 'UNDER']) selection!: 'HOME' | 'DRAW' | 'AWAY' | 'OVER' | 'UNDER';
  @IsOptional() @IsNumber() line?: number;
  @IsInt() @IsPositive() stake!: number;
  @IsString() quoteId!: string;
  @IsNumber() @Min(1) clientOdds!: number;
  /** 請求級冪等鍵（前端每次確認產生 uuid） */
  @IsOptional() @IsString() requestId?: string;
}

@Controller('predictions')
export class PredictionsController {
  constructor(
    private bets: BetsService,
    private markets: MarketsService,
    private leaderboardSvc: LeaderboardService,
  ) {}

  /** 公開：板塊清單（未登入可看，「看得到玩不到」是註冊鉤，圓桌 growth 定案） */
  @Get('boards')
  boards() {
    if (!isPredictionEnabled()) return { data: { enabled: false, boards: [] } };
    return { data: { enabled: true, boards: this.markets.boards() } };
  }

  /** 公開：單板塊開盤中賽事 + 賠率（含 quoteId） */
  @Get('markets/:board')
  async openMatches(@Param('board') board: string) {
    return { data: await this.markets.openMatches(board) };
  }

  /** 公開：排行榜（週/月，投注額加權 ROI 表現分） */
  @Get('leaderboard')
  async leaderboard(@Query('period') period?: string) {
    return { data: await this.leaderboardSvc.top(period === 'month' ? 'month' : 'week') };
  }

  /** 公開：會員戰績頁（三元組 + 近期注單；不含金額） */
  @Get('record/:nickname')
  async record(@Param('nickname') nickname: string) {
    return { data: await this.leaderboardSvc.publicRecord(nickname) };
  }

  @Post('bets')
  @UseGuards(JwtAuthGuard)
  async placeBet(@CurrentUser() user: { id: string }, @Body() dto: PlaceBetDto) {
    // enabled 檢查在 service 內（回機器可讀 PREDICTION_DISABLED），這裡不重複
    return { data: await this.bets.placeBet(user.id, dto) };
  }

  @Get('bets')
  @UseGuards(JwtAuthGuard)
  async myBets(@CurrentUser() user: { id: string }, @Query('take') take?: string) {
    if (!isPredictionEnabled()) return { data: { enabled: false, bets: [] } };
    return { data: { enabled: true, bets: await this.bets.listMyBets(user.id, take ? Number(take) : 20) } };
  }
}
