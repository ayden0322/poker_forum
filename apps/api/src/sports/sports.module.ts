import { Module } from '@nestjs/common';
import { SportsController } from './sports.controller';
import { SportsService } from './sports.service';
import { MLBStatsModule } from './mlb-stats/mlb-stats.module';
import { BaseballCommonModule } from './baseball-common/baseball-common.module';
import { CpblStatsModule } from './cpbl-stats/cpbl-stats.module';

@Module({
  imports: [MLBStatsModule, BaseballCommonModule, CpblStatsModule],
  controllers: [SportsController],
  providers: [SportsService],
  exports: [SportsService, MLBStatsModule, BaseballCommonModule, CpblStatsModule],
})
export class SportsModule {}
