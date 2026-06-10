import { Module } from '@nestjs/common';
import { BasketballCommonService } from './basketball-common.service';
import { BasketballCommonController } from './basketball-common.controller';
import { BasketballSeedController } from './basketball-seed.controller';
import { TpblStatsModule } from '../tpbl-stats/tpbl-stats.module';
import { TranslationModule } from '../../translation/translation.module';

@Module({
  imports: [TpblStatsModule, TranslationModule],
  controllers: [BasketballCommonController, BasketballSeedController],
  providers: [BasketballCommonService],
  exports: [BasketballCommonService],
})
export class BasketballCommonModule {}
