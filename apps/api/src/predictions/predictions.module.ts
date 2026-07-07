import { Module } from '@nestjs/common';
import { EconomyModule } from '../economy/economy.module';
import { OddsPipelineService } from './odds-pipeline.service';
import { PredictionsCron } from './predictions.cron';
import { BetsService } from './bets.service';
import { PredictionsController } from './predictions.controller';

// P幣競猜（二期）：賠率管線（賽程同步 + 盤口快照）+ 下注收單。
// 結算 cron 為後續 commit，依《P幣競猜系統-詳細設計規格.md》§10 開工順序。
@Module({
  imports: [EconomyModule],
  controllers: [PredictionsController],
  providers: [OddsPipelineService, PredictionsCron, BetsService],
  exports: [OddsPipelineService],
})
export class PredictionsModule {}
