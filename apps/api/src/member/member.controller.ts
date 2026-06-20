import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Currency } from '@betting-forum/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EconomyService } from '../economy/economy.service';
import { LevelService } from '../economy/level.service';
import { TasksService } from '../tasks/tasks.service';
import { isMemberEconomyEnabled } from '../economy/economy.flags';

/**
 * 會員經濟唯讀 API（給前端顯示 G/P幣、等級、今日任務）。
 * fail-closed：總開關關閉時一律回 { enabled: false }，前端據此完全隱藏會員 UI，
 * 確保 schema/程式上 prod、但 go-live 翻開關前前台看不到任何會員系統入口。
 */
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
