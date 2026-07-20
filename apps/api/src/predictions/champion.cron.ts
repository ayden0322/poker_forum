// P幣競猜 — 週冠軍發放排程
// 台北時間週一 05:00，接在對帳後、避開賽事高峰。
// 顯式綁 Asia/Taipei：不賭 prod 容器時區，週界算錯會發錯冠軍。
// 冪等：同週重跑會 upsert 同一冠軍（延長稱號到期、勳章已擁有跳過），無害。

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ChampionService } from './champion.service';
import { isPredictionEnabled } from './prediction.flags';

@Injectable()
export class ChampionCron {
  private readonly logger = new Logger(ChampionCron.name);

  constructor(
    private config: ConfigService,
    private champion: ChampionService,
  ) {}

  @Cron('0 5 * * 1', { timeZone: 'Asia/Taipei' })
  async tick() {
    if (!isPredictionEnabled()) return;
    if (this.config.get<string>('MEMBER_ECONOMY_ENABLED') !== 'true') return; // 稱號/勳章依賴裝飾系統
    try {
      const granted = await this.champion.grantWeeklyChampions();
      this.logger.log(`週冠軍發放完成：${granted.length} 位（${granted.map((g) => `${g.type}:${g.nickname}`).join('、') || '無'}）`);
    } catch (err) {
      this.logger.error(`週冠軍發放失敗：${err}`);
    }
  }
}
