import { Module } from '@nestjs/common';
import { LotteryService } from './lottery.service';
import { LotteryController } from './lottery.controller';
import { LotteryTask } from './lottery.task';

@Module({
  controllers: [LotteryController],
  providers: [LotteryService, LotteryTask],
  exports: [LotteryService],
})
export class LotteryModule {}
