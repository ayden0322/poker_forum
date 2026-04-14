import { Module } from '@nestjs/common';
import { SportsController } from './sports.controller';
import { SportsService } from './sports.service';
import { MLBStatsModule } from './mlb-stats/mlb-stats.module';

@Module({
  imports: [MLBStatsModule],
  controllers: [SportsController],
  providers: [SportsService],
  exports: [SportsService, MLBStatsModule],
})
export class SportsModule {}
