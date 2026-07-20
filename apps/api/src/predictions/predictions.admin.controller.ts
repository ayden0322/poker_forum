// Admin：P幣競猜管理（沖正/作廢/對帳/注單查詢）
// PageGuard 由路徑 /admin/predictions 自動對應 pageKey 'predictions'（page-registry 已註冊，admin 以上）

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PageGuard } from '../common/guards/page.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@betting-forum/database';
import { PredictionsAdminService } from './predictions-admin.service';
import { ReconciliationService } from './reconciliation.service';

class VoidBetDto {
  @IsString() @MaxLength(200) reason!: string;
}

class ReverseBetDto {
  @IsIn(['WON', 'LOST', 'PUSH']) outcome!: 'WON' | 'LOST' | 'PUSH';
  @IsString() @MaxLength(200) reason!: string;
}

@ApiTags('Admin · Predictions')
@ApiBearerAuth()
@Controller('admin/predictions')
@UseGuards(JwtAuthGuard, RolesGuard, PageGuard)
@Roles(Role.ADMIN) // 金流級工具：admin 起跳（權限矩陣可再收斂）
export class PredictionsAdminController {
  constructor(
    private admin: PredictionsAdminService,
    private reconciliation: ReconciliationService,
  ) {}

  @Get('bets')
  @ApiOperation({ summary: '注單查詢（依 betId / userId）' })
  async bets(@Query('betId') betId?: string, @Query('userId') userId?: string, @Query('take') take?: string) {
    return { data: await this.admin.findBets({ betId, userId, take: take ? Number(take) : undefined }) };
  }

  @Post('bets/:id/void')
  @ApiOperation({ summary: '作廢未結算注單（退回本金）' })
  async voidBet(@Param('id') id: string, @Body() dto: VoidBetDto, @CurrentUser() user: { id: string }) {
    return { data: await this.admin.voidBet(id, user.id, dto.reason) };
  }

  @Post('bets/:id/reverse')
  @ApiOperation({ summary: '沖正已結算注單（比分改判；差額走 PREDICTION_REVERSAL）' })
  async reverseBet(@Param('id') id: string, @Body() dto: ReverseBetDto, @CurrentUser() user: { id: string }) {
    return { data: await this.admin.reverseBet(id, dto.outcome, user.id, dto.reason) };
  }

  @Get('reconciliation')
  @ApiOperation({ summary: '即時對帳（ledger vs bet 不變量檢查）' })
  async reconcile() {
    return { data: await this.reconciliation.run() };
  }
}
