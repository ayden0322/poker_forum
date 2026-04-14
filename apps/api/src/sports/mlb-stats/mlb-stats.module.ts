import { Module } from '@nestjs/common';
import { MLBStatsService } from './mlb-stats.service';

@Module({
  providers: [MLBStatsService],
  exports: [MLBStatsService],
})
export class MLBStatsModule {}
