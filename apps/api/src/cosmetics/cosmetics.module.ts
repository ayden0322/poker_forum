import { Module } from '@nestjs/common';
import { CosmeticsController } from './cosmetics.controller';
import { CosmeticsService } from './cosmetics.service';
import { EconomyModule } from '../economy/economy.module';

/**
 * 會員端裝飾商店模組（商店/庫存/購買/裝備/釘選）。
 * 依賴 EconomyModule 的 EconomyService（debitInTx 原子扣款 + getBalance）。
 */
@Module({
  imports: [EconomyModule],
  controllers: [CosmeticsController],
  providers: [CosmeticsService],
})
export class CosmeticsModule {}
