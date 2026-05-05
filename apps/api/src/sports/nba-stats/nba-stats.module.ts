import { Module } from '@nestjs/common';
import { NBAStatsService } from './nba-stats.service';
import { NBAStatsController } from './nba-stats.controller';
import { NBASeedController } from './nba-seed.controller';
import { TranslationModule } from '../../translation/translation.module';

@Module({
  imports: [TranslationModule],
  controllers: [NBAStatsController, NBASeedController],
  providers: [NBAStatsService],
  exports: [NBAStatsService],
})
export class NBAStatsModule {}
