// P幣競猜 — 下注/注單 API（規格 §3.1）
// fail-closed：PREDICTION_ENABLED 未開時回 enabled:false，不洩漏功能存在與否的細節。

import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BetsService } from './bets.service';
import { isPredictionEnabled } from './prediction.flags';

class PlaceBetDto {
  @IsString() matchId!: string;
  @IsIn(['WINLOSE', 'OVER_UNDER']) market!: 'WINLOSE' | 'OVER_UNDER';
  @IsIn(['HOME', 'DRAW', 'AWAY', 'OVER', 'UNDER']) selection!: 'HOME' | 'DRAW' | 'AWAY' | 'OVER' | 'UNDER';
  @IsOptional() @IsNumber() line?: number;
  @IsInt() @IsPositive() stake!: number;
  @IsString() quoteId!: string;
  @IsNumber() @Min(1) clientOdds!: number;
}

@Controller('predictions')
@UseGuards(JwtAuthGuard)
export class PredictionsController {
  constructor(private bets: BetsService) {}

  @Post('bets')
  async placeBet(@CurrentUser() user: { id: string }, @Body() dto: PlaceBetDto) {
    // enabled 檢查在 service 內（回機器可讀 PREDICTION_DISABLED），這裡不重複
    return { data: await this.bets.placeBet(user.id, dto) };
  }

  @Get('bets')
  async myBets(@CurrentUser() user: { id: string }, @Query('take') take?: string) {
    if (!isPredictionEnabled()) return { data: { enabled: false, bets: [] } };
    return { data: { enabled: true, bets: await this.bets.listMyBets(user.id, take ? Number(take) : 20) } };
  }
}
