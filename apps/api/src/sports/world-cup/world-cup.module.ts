import { Module } from '@nestjs/common';
import { WorldCupService } from './world-cup.service';
import { WorldCupController } from './world-cup.controller';
import { WorldCupAdminController } from './world-cup.admin.controller';

@Module({
  controllers: [WorldCupController, WorldCupAdminController],
  providers: [WorldCupService],
  exports: [WorldCupService],
})
export class WorldCupModule {}
