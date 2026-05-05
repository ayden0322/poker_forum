import { Module } from '@nestjs/common';
import { SportsController } from './sports.controller';
import { SportsService } from './sports.service';
import { MLBStatsModule } from './mlb-stats/mlb-stats.module';
import { NBAStatsModule } from './nba-stats/nba-stats.module';
import { BaseballCommonModule } from './baseball-common/baseball-common.module';
import { CpblStatsModule } from './cpbl-stats/cpbl-stats.module';
import { NpbStatsModule } from './npb-stats/npb-stats.module';
import { KboStatsModule } from './kbo-stats/kbo-stats.module';

@Module({
  imports: [MLBStatsModule, NBAStatsModule, BaseballCommonModule, CpblStatsModule, NpbStatsModule, KboStatsModule],
  controllers: [SportsController],
  providers: [SportsService],
  exports: [SportsService, MLBStatsModule, NBAStatsModule, BaseballCommonModule, CpblStatsModule, NpbStatsModule, KboStatsModule],
})
export class SportsModule {}
