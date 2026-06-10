import { Module } from '@nestjs/common';
import { TpblStatsService } from './tpbl-stats.service';

@Module({
  providers: [TpblStatsService],
  exports: [TpblStatsService],
})
export class TpblStatsModule {}
