// P幣競猜 — 每日對帳排程（台灣時間 05:00 = UTC 21:00；避開賽事與結算高峰）
// 對帳是「帳」的最後防線：唯讀檢查，不平只告警不自動修（修帳一律走 admin 沖正留軌跡）。

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReconciliationService } from './reconciliation.service';
import { isPredictionEnabled } from './prediction.flags';

@Injectable()
export class ReconciliationCron {
  private readonly logger = new Logger(ReconciliationCron.name);

  constructor(private reconciliation: ReconciliationService) {}

  @Cron('0 21 * * *')
  async tick() {
    if (!isPredictionEnabled()) return;
    try {
      await this.reconciliation.run();
    } catch (err) {
      this.logger.error(`每日對帳失敗：${err}`);
    }
  }
}
