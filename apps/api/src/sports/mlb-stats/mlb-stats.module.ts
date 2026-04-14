import { Module } from '@nestjs/common';
import { MLBStatsService } from './mlb-stats.service';
import { MLBStatsController } from './mlb-stats.controller';

@Module({
  controllers: [MLBStatsController],
  providers: [MLBStatsService],
  exports: [MLBStatsService],
})
export class MLBStatsModule {}
