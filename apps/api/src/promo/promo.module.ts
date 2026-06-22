import { Module } from '@nestjs/common';
import { PromoController } from './promo.controller';
import { PromoAdminController } from './promo-admin.controller';
import { PromoService } from './promo.service';

/**
 * 推廣碼模組。匯出 PromoService 供 AuthModule 在註冊時做歸因。
 * 不 import AuthModule（避免與 AuthModule → PromoModule 形成循環）；
 * 後台控制器的 JwtAuthGuard 走 passport 全域註冊的 'jwt' 策略、PageGuard 為全域提供。
 */
@Module({
  controllers: [PromoController, PromoAdminController],
  providers: [PromoService],
  exports: [PromoService],
})
export class PromoModule {}
