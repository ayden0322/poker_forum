import { Module } from '@nestjs/common';
import { CpblStatsService } from './cpbl-stats.service';
import { CpblStatsController } from './cpbl-stats.controller';

@Module({
  controllers: [CpblStatsController],
  providers: [CpblStatsService],
  exports: [CpblStatsService],
})
export class CpblStatsModule {}
