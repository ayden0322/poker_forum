import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { MailModule } from '../mail/mail.module';
import { PhoneVerificationController } from './phone-verification.controller';
import { PhoneVerificationService } from './phone-verification.service';
import { SmsService } from './sms.service';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [PhoneVerificationController],
  providers: [PhoneVerificationService, SmsService],
  exports: [SmsService, PhoneVerificationService],
})
export class VerificationModule {}
