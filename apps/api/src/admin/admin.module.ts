import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminSmsProviderController } from './sms-provider.controller';
import { AdminSportsConfigController } from './sports-config.controller';
import { VerificationModule } from '../verification/verification.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [VerificationModule, AuthModule],
  controllers: [AdminController, AdminSmsProviderController, AdminSportsConfigController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
