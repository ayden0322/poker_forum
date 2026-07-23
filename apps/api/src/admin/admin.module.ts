import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminSmsProviderController } from './sms-provider.controller';
import { AdminSportsConfigController } from './sports-config.controller';
import { AdminCosmeticsController } from './cosmetics.controller';
import { PermissionController } from './permission.controller';
import { VerificationModule } from '../verification/verification.module';
import { AuthModule } from '../auth/auth.module';
import { PredictionsModule } from '../predictions/predictions.module';
import { EconomyModule } from '../economy/economy.module';

@Module({
  imports: [VerificationModule, AuthModule, PredictionsModule, EconomyModule],
  controllers: [
    AdminController,
    AdminSmsProviderController,
    AdminSportsConfigController,
    AdminCosmeticsController,
    PermissionController,
  ],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
