import { Module } from '@nestjs/common';
import { EconomyService } from './economy.service';

/**
 * 會員經濟模組（G幣/P幣 帳本）。
 * 匯出 EconomyService 供任務、商店、兌換、預測等模組注入。
 * PrismaService 由全域 PrismaModule 提供，故此處不需 imports。
 */
@Module({
  providers: [EconomyService],
  exports: [EconomyService],
})
export class EconomyModule {}
