import { Module } from '@nestjs/common';
import { KboStatsService } from './kbo-stats.service';

@Module({
  providers: [KboStatsService],
  exports: [KboStatsService],
})
export class KboStatsModule {}
