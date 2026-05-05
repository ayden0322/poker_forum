import { Module } from '@nestjs/common';
import { KboStatsService } from './kbo-stats.service';
import { TranslationModule } from '../../translation/translation.module';

@Module({
  imports: [TranslationModule],
  providers: [KboStatsService],
  exports: [KboStatsService],
})
export class KboStatsModule {}
