// P幣競猜 — 賠率管線排程（分層頻率，規格 §2.4）
// - cron 每 5 分鐘 tick 一次
// - 近期窗（6h 內有未開賽場次）：每 tick 都跑（≈5 分鐘一輪）
// - 遠期：距上輪 ≥30 分鐘才跑
// - 額度守門觸發（當日 odds 呼叫超軟上限）：強制只跑遠期頻率
// - 完全無未開賽場次（休賽/盤口未開）：遠期輪照跑（賽程同步本身要靠它發現新場次）

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { OddsPipelineService } from './odds-pipeline.service';
import { enabledBoards, FAR_INTERVAL_MS, NEAR_WINDOW_MS } from './prediction.config';

@Injectable()
export class PredictionsCron {
  private readonly logger = new Logger(PredictionsCron.name);
  private readonly apiKey: string;
  /** 各 board 上一次「實際跑輪」的時間（遠期頻率判斷用；重啟歸零 = 開機第一 tick 必跑，可接受） */
  private lastRunAt = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private pipeline: OddsPipelineService,
  ) {
    this.apiKey = this.config.get<string>('API_SPORTS_KEY', '');
  }

  @Cron('*/5 * * * *')
  async tick() {
    if (!this.apiKey) return;
    for (const board of enabledBoards()) {
      try {
        const now = Date.now();
        const last = this.lastRunAt.get(board.boardSlug) ?? 0;
        const farDue = now - last >= FAR_INTERVAL_MS;

        // 額度守門：超軟上限 → 只允許遠期輪
        const overCap = await this.pipeline.isOverSoftCap(board.apiHost);

        let shouldRun = farDue;
        if (!shouldRun && !overCap) {
          // 近期窗判斷：DB 有「未開賽且 6h 內開打」的場次 → 每 tick 都跑
          const nearCount = await this.prisma.predictionMatch.count({
            where: {
              boardSlug: board.boardSlug,
              apiStatus: 'NS',
              startTime: { gt: new Date(now), lte: new Date(now + NEAR_WINDOW_MS) },
            },
          });
          shouldRun = nearCount > 0;
        }
        if (!shouldRun) continue;

        const calls = await this.pipeline.runRound(board);
        this.lastRunAt.set(board.boardSlug, now);
        this.logger.log(`賠率輪完成（${board.boardSlug}）：${calls} 次 API 呼叫`);
      } catch (err) {
        this.logger.error(`賠率輪失敗（${board.boardSlug}）：${err}`);
      }
    }
  }
}
