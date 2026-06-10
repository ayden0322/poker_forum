import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { EconomyModule } from '../economy/economy.module';

/**
 * 每日任務模組。規則引擎（去重 + 每日上限 + 發獎）。
 * 依賴 EconomyModule 的 EconomyService（發 G）與 LevelService（發經驗）。
 * #3 先不接真實事件，由 #4 把 completeTask 掛到登入/發文等觸發點。
 */
@Module({
  imports: [EconomyModule],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
