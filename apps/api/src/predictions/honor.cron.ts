// 榮譽系統 — 月賽季結算排程
// 台北每月 1 日 09:00 結算上個月、加冕冠軍。
// 顯式綁 Asia/Taipei：不賭 prod 容器時區（Tencent 東京容器不保證 UTC），避免月界算錯／加冕給錯人。
// 冪等：同月重跑會 upsert 同一賽季/冠軍（延長在位到期、徽章已擁有跳過），無害。

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SeasonService } from './season.service';
import { isPredictionEnabled } from './prediction.flags';

@Injectable()
export class HonorCron {
  private readonly logger = new Logger(HonorCron.name);

  constructor(
    private config: ConfigService,
    private season: SeasonService,
  ) {}

  @Cron('0 9 1 * *', { timeZone: 'Asia/Taipei' })
  async tick() {
    if (!isPredictionEnabled()) return;
    if (this.config.get<string>('MEMBER_ECONOMY_ENABLED') !== 'true') return; // 冠軍稱號/徽章依賴裝飾系統
    try {
      const crowned = await this.season.closeSeasonAndCrown();
      this.logger.log(`月賽季加冕完成：${crowned.length} 位（${crowned.map((c) => `${c.board}:${c.nickname}`).join('、') || '無'}）`);
    } catch (err) {
      this.logger.error(`月賽季加冕失敗：${err}`);
    }
  }
}
