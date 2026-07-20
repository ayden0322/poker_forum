// P幣競猜 — 結算排程（規格 §4）
// 每 5 分鐘：賽果同步 + 到期結算。無待結場次時零 API 呼叫（syncResults 先查 DB 才打 API）。

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SettlementService } from './settlement.service';
import { enabledBoards } from './prediction.config';
import { isPredictionEnabled } from './prediction.flags';
import { PredictionBoardsService } from './prediction-boards.service';

@Injectable()
export class SettlementCron {
  private readonly logger = new Logger(SettlementCron.name);
  private readonly apiKey: string;

  constructor(
    private config: ConfigService,
    private settlement: SettlementService,
    private boardsCfg: PredictionBoardsService,
  ) {
    this.apiKey = this.config.get<string>('API_SPORTS_KEY', '');
  }

  @Cron('*/5 * * * *')
  async tick() {
    if (!isPredictionEnabled()) return; // fail-closed
    if (!this.apiKey) return;
    for (const board of await this.boardsCfg.enabled()) {
      try {
        await this.settlement.runRound(board);
      } catch (err) {
        this.logger.error(`結算 tick 失敗（${board.boardSlug}）：${err}`);
      }
    }
  }
}
