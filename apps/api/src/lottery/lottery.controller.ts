import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LotteryService, GameType, GAME_CONFIG } from './lottery.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@betting-forum/database';

@ApiTags('彩券')
@Controller('lottery')
export class LotteryController {
  constructor(private readonly lotteryService: LotteryService) {}

  @Get('latest')
  @ApiOperation({ summary: '取得各彩種最新開獎結果' })
  async getLatest() {
    const data = await this.lotteryService.getLatest();
    return { data };
  }

  @Get('results')
  @ApiOperation({ summary: '查詢歷史開獎紀錄' })
  async getResults(
    @Query('gameType') gameType: string,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    this.validateGameType(gameType);
    const data = await this.lotteryService.getResults(gameType as GameType, limit, page);
    return { data };
  }

  @Get('stats')
  @ApiOperation({ summary: '號碼統計分析' })
  async getStats(
    @Query('gameType') gameType: string,
    @Query('range', new DefaultValuePipe(100), ParseIntPipe) range: number,
  ) {
    this.validateGameType(gameType);
    const data = await this.lotteryService.getStats(gameType as GameType, range);
    return { data };
  }

  @Post('check')
  @ApiOperation({ summary: '對獎' })
  async check(
    @Body() body: { gameType: string; numbers: number[]; specialNum?: number },
  ) {
    this.validateGameType(body.gameType);
    const data = await this.lotteryService.checkNumbers(
      body.gameType as GameType,
      body.numbers,
      body.specialNum,
    );
    return { data };
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '手動觸發同步（需管理員權限）' })
  async sync(@Query('gameType') gameType?: string) {
    if (gameType) {
      this.validateGameType(gameType);
      const count = await this.lotteryService.syncResults(gameType as GameType);
      return { data: { [gameType]: count } };
    }

    // 同步全部
    const result: Record<string, number> = {};
    for (const gt of Object.keys(GAME_CONFIG) as GameType[]) {
      result[gt] = await this.lotteryService.syncResults(gt);
    }
    return { data: result };
  }

  @Post('backfill')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '補抓過去 N 個月的歷史開獎（需管理員權限）' })
  async backfill(
    @Query('gameType') gameType?: string,
    @Query('months', new DefaultValuePipe(12), ParseIntPipe) months: number = 12,
    @Query('endMonth') endMonth?: string,
  ) {
    if (months < 1 || months > 60) {
      throw new BadRequestException('months 必須介於 1~60 之間');
    }
    if (endMonth && !/^\d{4}-\d{2}$/.test(endMonth)) {
      throw new BadRequestException('endMonth 格式須為 YYYY-MM');
    }

    if (gameType) {
      this.validateGameType(gameType);
      const count = await this.lotteryService.backfillResults(
        gameType as GameType,
        months,
        endMonth,
      );
      return { data: { [gameType]: count } };
    }

    // 全部彩種（已停售的跳過）
    const result: Record<string, number> = {};
    for (const gt of Object.keys(GAME_CONFIG) as GameType[]) {
      const config = GAME_CONFIG[gt] as { discontinued?: boolean };
      if (config.discontinued) {
        result[gt] = 0;
        continue;
      }
      result[gt] = await this.lotteryService.backfillResults(gt, months, endMonth);
    }
    return { data: result };
  }

  private validateGameType(gameType: string) {
    if (!gameType || !(gameType in GAME_CONFIG)) {
      throw new BadRequestException(
        `無效的彩種，請使用：${Object.keys(GAME_CONFIG).join(', ')}`,
      );
    }
  }
}
