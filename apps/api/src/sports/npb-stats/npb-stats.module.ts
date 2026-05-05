import { Module } from '@nestjs/common';
import { NpbStatsService } from './npb-stats.service';
import { TranslationModule } from '../../translation/translation.module';

@Module({
  imports: [TranslationModule],
  providers: [NpbStatsService],
  exports: [NpbStatsService],
})
export class NpbStatsModule {}
