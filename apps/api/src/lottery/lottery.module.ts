import { Module } from '@nestjs/common';
import { LotteryService } from './lottery.service';
import { LotteryController } from './lottery.controller';
import { LotteryTask } from './lottery.task';
import { MyPicksController } from './my-picks.controller';
import { MyPicksService } from './my-picks.service';

@Module({
  controllers: [LotteryController, MyPicksController],
  providers: [LotteryService, LotteryTask, MyPicksService],
  exports: [LotteryService],
})
export class LotteryModule {}
