import { Module } from '@nestjs/common';
import { WorldCupService } from './world-cup.service';
import { WorldCupController } from './world-cup.controller';
import { WorldCupAdminController } from './world-cup.admin.controller';
import { WorldCupCron } from './world-cup.cron';

@Module({
  controllers: [WorldCupController, WorldCupAdminController],
  providers: [WorldCupService, WorldCupCron],
  exports: [WorldCupService],
})
export class WorldCupModule {}
