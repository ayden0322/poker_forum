import { Module } from '@nestjs/common';
import { BaseballCommonService } from './baseball-common.service';
import { BaseballCommonController } from './baseball-common.controller';
import { BaseballSeedController } from './baseball-seed.controller';
import { TranslationModule } from '../../translation/translation.module';
import { CpblStatsModule } from '../cpbl-stats/cpbl-stats.module';
import { NpbStatsModule } from '../npb-stats/npb-stats.module';
import { KboStatsModule } from '../kbo-stats/kbo-stats.module';

@Module({
  imports: [TranslationModule, CpblStatsModule, NpbStatsModule, KboStatsModule],
  controllers: [BaseballCommonController, BaseballSeedController],
  providers: [BaseballCommonService],
  exports: [BaseballCommonService],
})
export class BaseballCommonModule {}
