import { Module } from '@nestjs/common';
import { MemberController } from './member.controller';
import { EconomyModule } from '../economy/economy.module';
import { TasksModule } from '../tasks/tasks.module';

/**
 * 會員經濟唯讀對外層。聚合 EconomyService / LevelService（來自 EconomyModule）
 * 與 TasksService（來自 TasksModule），只提供 GET 查詢，不含任何寫入。
 */
@Module({
  imports: [EconomyModule, TasksModule],
  controllers: [MemberController],
})
export class MemberModule {}
