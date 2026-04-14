import { Module } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { TranslationCron } from './translation.cron';

@Module({
  providers: [TranslationService, TranslationCron],
  exports: [TranslationService],
})
export class TranslationModule {}
