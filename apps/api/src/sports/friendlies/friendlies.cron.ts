import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import {
  callFootballApi,
  upsertFixtures,
  FRIENDLIES_LEAGUE_ID,
  FRIENDLIES_SEASON,
  ApiFixture,
} from './friendlies.apisports';

/**
 * 國際友誼賽即時資料排程
 * - 每 3 分鐘：刷新 LIVE 進行中的場次比分/分鐘（live=all）
 * - 每日 04:10：整季全量同步（補新增 fixture、開賽時間異動、完賽比分）
 *
 * ⚠️ key 到期提醒：API-Sports Pro key 到期後呼叫會 401，
 *    LIVE 比分會凍結在最後一次成功值。續訂後即自動恢復。
 */
@Injectable()
export class FriendliesCron {
  private readonly logger = new Logger(FriendliesCron.name);
  private readonly apiKey: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('API_SPORTS_KEY', '');
  }

  /** 每 3 分鐘刷新進行中的友誼賽 */
  @Cron('*/3 * * * *')
  async refreshLive() {
    if (!this.apiKey) return;
    try {
      const fixtures = await callFootballApi<ApiFixture[]>(this.apiKey, '/fixtures', {
        league: FRIENDLIES_LEAGUE_ID,
        season: FRIENDLIES_SEASON,
        live: 'all',
      });
      if (!fixtures.length) return;
      const r = await upsertFixtures(this.prisma, fixtures);
      this.logger.log(`友誼賽 LIVE 刷新：${r.matches} 場`);
    } catch (err) {
      this.logger.error(`友誼賽 LIVE 刷新失敗：${err}`);
    }
  }

  /** 每日 04:10 整季全量同步 */
  @Cron('10 4 * * *')
  async dailySync() {
    if (!this.apiKey) return;
    try {
      const fixtures = await callFootballApi<ApiFixture[]>(this.apiKey, '/fixtures', {
        league: FRIENDLIES_LEAGUE_ID,
        season: FRIENDLIES_SEASON,
      });
      const r = await upsertFixtures(this.prisma, fixtures);
      this.logger.log(`友誼賽每日同步完成：${r.matches} 場`);
    } catch (err) {
      this.logger.error(`友誼賽每日同步失敗：${err}`);
    }
  }
}
