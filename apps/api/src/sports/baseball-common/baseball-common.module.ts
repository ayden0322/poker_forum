import { Module } from '@nestjs/common';
import { BaseballCommonService } from './baseball-common.service';
import { BaseballCommonController } from './baseball-common.controller';
import { BaseballSeedController } from './baseball-seed.controller';
import { TranslationModule } from '../../translation/translation.module';

@Module({
  imports: [TranslationModule],
  controllers: [BaseballCommonController, BaseballSeedController],
  providers: [BaseballCommonService],
  exports: [BaseballCommonService],
})
export class BaseballCommonModule {}
