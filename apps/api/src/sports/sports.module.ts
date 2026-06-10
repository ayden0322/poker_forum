import { Module } from '@nestjs/common';
import { SportsController } from './sports.controller';
import { SportsService } from './sports.service';
import { MLBStatsModule } from './mlb-stats/mlb-stats.module';
import { NBAStatsModule } from './nba-stats/nba-stats.module';
import { BaseballCommonModule } from './baseball-common/baseball-common.module';
import { BasketballCommonModule } from './basketball-common/basketball-common.module';
import { CpblStatsModule } from './cpbl-stats/cpbl-stats.module';
import { NpbStatsModule } from './npb-stats/npb-stats.module';
import { KboStatsModule } from './kbo-stats/kbo-stats.module';
import { WorldCupModule } from './world-cup/world-cup.module';
import { FriendliesModule } from './friendlies/friendlies.module';

@Module({
  imports: [MLBStatsModule, NBAStatsModule, BaseballCommonModule, BasketballCommonModule, CpblStatsModule, NpbStatsModule, KboStatsModule, WorldCupModule, FriendliesModule],
  controllers: [SportsController],
  providers: [SportsService],
  exports: [SportsService, MLBStatsModule, NBAStatsModule, BaseballCommonModule, BasketballCommonModule, CpblStatsModule, NpbStatsModule, KboStatsModule, WorldCupModule, FriendliesModule],
})
export class SportsModule {}
