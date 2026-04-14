import { Module } from '@nestjs/common';
import { MLBStatsService } from './mlb-stats.service';
import { MLBStatsController } from './mlb-stats.controller';
import { MLBSeedController } from './mlb-seed.controller';
import { TranslationModule } from '../../translation/translation.module';

@Module({
  imports: [TranslationModule],
  controllers: [MLBStatsController, MLBSeedController],
  providers: [MLBStatsService],
  exports: [MLBStatsService],
})
export class MLBStatsModule {}
