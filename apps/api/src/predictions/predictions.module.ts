import { Module } from '@nestjs/common';
import { OddsPipelineService } from './odds-pipeline.service';
import { PredictionsCron } from './predictions.cron';

// P幣競猜（二期）：本模組目前只含賠率管線（賽程同步 + 盤口快照）。
// 下注 API / 結算 cron 為後續 commit，依《P幣競猜系統-詳細設計規格.md》§10 開工順序。
@Module({
  providers: [OddsPipelineService, PredictionsCron],
  exports: [OddsPipelineService],
})
export class PredictionsModule {}
