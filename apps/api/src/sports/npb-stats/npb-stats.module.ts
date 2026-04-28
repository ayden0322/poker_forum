import { Module } from '@nestjs/common';
import { NpbStatsService } from './npb-stats.service';

@Module({
  providers: [NpbStatsService],
  exports: [NpbStatsService],
})
export class NpbStatsModule {}
