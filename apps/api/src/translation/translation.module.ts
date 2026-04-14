import { Module } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { TranslationCron } from './translation.cron';
import { TranslationAdminController } from './translation.controller';

@Module({
  controllers: [TranslationAdminController],
  providers: [TranslationService, TranslationCron],
  exports: [TranslationService],
})
export class TranslationModule {}
