import { Module } from '@nestjs/common';
import { EconomyModule } from '../economy/economy.module';
import { OddsPipelineService } from './odds-pipeline.service';
import { PredictionsCron } from './predictions.cron';
import { BetsService } from './bets.service';
import { MarketsService } from './markets.service';
import { LeaderboardService } from './leaderboard.service';
import { MatchLinkService } from './match-link.service';
import { ChampionService } from './champion.service';
import { ChampionCron } from './champion.cron';
import { HonorService } from './honor.service';
import { SeasonService } from './season.service';
import { HonorCron } from './honor.cron';
import { HonorReadService } from './honor-read.service';
import { HonorController } from './honor.controller';
import { PredictionsController } from './predictions.controller';
import { SettlementService } from './settlement.service';
import { SettlementCron } from './settlement.cron';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationCron } from './reconciliation.cron';
import { PredictionsAdminService } from './predictions-admin.service';
import { PredictionsAdminController } from './predictions.admin.controller';

// P幣競猜（二期）：賠率管線 + 下注收單 + 結算 + 對帳 + admin 沖正。
// 依《P幣競猜系統-詳細設計規格.md》§10 開工順序。
@Module({
  imports: [EconomyModule],
  controllers: [PredictionsController, PredictionsAdminController, HonorController],
  providers: [
    OddsPipelineService, PredictionsCron, BetsService, MarketsService, LeaderboardService, MatchLinkService,
    ChampionService, ChampionCron,
    HonorService, SeasonService, HonorCron, HonorReadService,
    SettlementService, SettlementCron,
    ReconciliationService, ReconciliationCron, PredictionsAdminService,
  ],
  exports: [OddsPipelineService],
})
export class PredictionsModule {}
