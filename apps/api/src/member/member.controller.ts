import { Body, Controller, Get, HttpException, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsPositive, IsString, Max } from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Currency } from '@betting-forum/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EconomyService, InsufficientBalanceError } from '../economy/economy.service';
import { LevelService } from '../economy/level.service';
import { TasksService } from '../tasks/tasks.service';
import { isMemberEconomyEnabled } from '../economy/economy.flags';

/**
 * 會員經濟唯讀 API（給前端顯示 G/P幣、等級、今日任務）。
 * fail-closed：總開關關閉時一律回 { enabled: false }，前端據此完全隱藏會員 UI，
 * 確保 schema/程式上 prod、但 go-live 翻開關前前台看不到任何會員系統入口。
 */
class ExchangeDto {
  @IsInt() @IsPositive() @Max(1_000_000) g!: number;
  /** 請求冪等鍵（前端每次確認產生 uuid） */
  @IsString() requestId!: string;
}

@ApiTags('member')
@Controller('member')
export class MemberController {
  constructor(
    private readonly economy: EconomyService,
    private readonly level: LevelService,
    private readonly tasks: TasksService,
  ) {}

  /** 我的會員經濟總覽：G/P幣餘額 + 等級 + 經驗進度。 */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async me(@CurrentUser() user: { id: string }) {
    if (!isMemberEconomyEnabled()) return { data: { enabled: false } };
    const [g, p, summary] = await Promise.all([
      this.economy.getBalance(user.id, Currency.G),
      this.economy.getBalance(user.id, Currency.P),
      this.level.getSummary(user.id),
    ]);
    return { data: { enabled: true, g, p, ...summary } };
  }

  /** G→P 兌換（單向；1 G = 10 P）。 */
  @Post('exchange')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async exchange(@CurrentUser() user: { id: string }, @Body() dto: ExchangeDto) {
    if (!isMemberEconomyEnabled()) {
      throw new HttpException({ code: 'MEMBER_ECONOMY_DISABLED', message: '會員經濟未開放' }, HttpStatus.FORBIDDEN);
    }
    try {
      return { data: { enabled: true, ...(await this.economy.exchangeGtoP(user.id, dto.g, dto.requestId)) } };
    } catch (e) {
      if (e instanceof InsufficientBalanceError) {
        throw new HttpException({ code: 'INSUFFICIENT_BALANCE', message: 'G 幣不足' }, HttpStatus.BAD_REQUEST);
      }
      throw e;
    }
  }

  /** 我的今日每日任務狀態（進度 / 是否完成 / 每日上限）。 */
  @Get('tasks/today')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async tasksToday(@CurrentUser() user: { id: string }) {
    if (!isMemberEconomyEnabled()) return { data: { enabled: false, tasks: [] } };
    const summary = await this.tasks.getTodayStatus(user.id);
    return { data: { enabled: true, ...summary } };
  }
}
