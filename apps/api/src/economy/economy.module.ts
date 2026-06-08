import { Module } from '@nestjs/common';
import { EconomyService } from './economy.service';
import { LevelService } from './level.service';

/**
 * 會員經濟模組（G幣/P幣 帳本 + 經驗/等級）。
 * 匯出 EconomyService / LevelService 供任務、商店、兌換、預測等模組注入。
 * PrismaService 由全域 PrismaModule 提供，故此處不需 imports。
 */
@Module({
  providers: [EconomyService, LevelService],
  exports: [EconomyService, LevelService],
})
export class EconomyModule {}
