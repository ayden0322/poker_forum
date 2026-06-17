import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import {
  callFootballApi,
  syncWorldCupScores,
  WC_LEAGUE_ID,
  WC_SEASON,
  ApiFixture,
} from './world-cup.apisports';

/**
 * FIFA 世界盃 2026 即時資料排程
 * - 每 30 秒：刷新 LIVE 進行中場次的比分/分鐘（live=all，回應快；只在有 live 場時才打到資料）
 * - 每 5 分鐘：整季全量同步（補完賽比分定版、開賽後狀態轉換）
 *
 * 業主為 API-Sports Pro（7500/日），要求高同步性，故採高頻。
 * key 到期後呼叫會 401、比分凍結在最後成功值，續訂即自動恢復（會記 error log）。
 */
@Injectable()
export class WorldCupCron {
  private readonly logger = new Logger(WorldCupCron.name);
  private readonly apiKey: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('API_SPORTS_KEY', '');
  }

  /** 每 30 秒刷新進行中的場次（6 欄位 cron，含秒）*/
  @Cron('*/30 * * * * *')
  async refreshLive() {
    if (!this.apiKey) return;
    try {
      const fixtures = await callFootballApi<ApiFixture[]>(this.apiKey, '/fixtures', {
        league: WC_LEAGUE_ID,
        season: WC_SEASON,
        live: 'all',
      });
      if (!fixtures.length) return;
      const r = await syncWorldCupScores(this.prisma, fixtures);
      this.logger.log(`世界盃 LIVE 刷新：更新 ${r.updated} 場`);
    } catch (err) {
      this.logger.error(`世界盃 LIVE 刷新失敗：${err}`);
    }
  }

  /** 每 5 分鐘全量同步（含完賽比分定版） */
  @Cron('*/5 * * * *')
  async fullSync() {
    if (!this.apiKey) return;
    try {
      const fixtures = await callFootballApi<ApiFixture[]>(this.apiKey, '/fixtures', {
        league: WC_LEAGUE_ID,
        season: WC_SEASON,
      });
      const r = await syncWorldCupScores(this.prisma, fixtures);
      if (r.unmatched.length) {
        this.logger.warn(`世界盃同步未配對 ${r.unmatched.length} 場：${r.unmatched.join('、')}`);
      }
      this.logger.log(`世界盃全量同步完成：更新 ${r.updated} 場`);
    } catch (err) {
      this.logger.error(`世界盃全量同步失敗：${err}`);
    }
  }
}
