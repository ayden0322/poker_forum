import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import {
  callFootballApi,
  syncWorldCupScores,
  fetchFixtureDetails,
  resolveLiveGroupMatches,
  wcDetailsCacheKey,
  WC_LEAGUE_ID,
  WC_SEASON,
  ApiFixture,
} from './world-cup.apisports';

/**
 * FIFA 世界盃 2026 即時資料排程
 * - 每 30 秒：刷新 LIVE 進行中場次的比分/分鐘（live=all，回應快；只在有 live 場時才打到資料）
 * - 每約 1 分鐘：把進行中場次的細節（進球/數據/陣容）抓進 Redis，前端 /details 只讀此快取，
 *   不在訪客請求路徑上打 API-Sports（API 額度與瀏覽流量脫鉤）。重用已取得的 live fixtures，不多打 /fixtures。
 * - 每 5 分鐘：整季全量同步（補完賽比分定版、開賽後狀態轉換）
 *
 * 業主為 API-Sports Pro（7500/日）。額度爆掉/權杖錯誤時 callFootballApi 會 throw、進 catch 記 error log
 * （不再靜默吞成空資料）；比分凍結在最後成功值，恢復後自動補上。
 */
@Injectable()
export class WorldCupCron {
  private readonly logger = new Logger(WorldCupCron.name);
  private readonly apiKey: string;
  /** refreshLive 計次：每 2 次（約 1 分鐘）順手刷新一次細節 */
  private liveTick = 0;
  /** 進行中場次細節在 Redis 的保留期（秒）；完賽後最後一次寫入會續存這麼久，供賽後回顧 */
  private static readonly DETAILS_TTL = 6 * 60 * 60;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private redis: RedisService,
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
      // 每 2 次（約 1 分鐘）把進行中場次的細節抓進 Redis，重用上面已取得的 live fixtures
      if (this.liveTick++ % 2 === 0) await this.refreshLiveDetails(fixtures);
    } catch (err) {
      this.logger.error(`世界盃 LIVE 刷新失敗：${err}`);
    }
  }

  /** 把進行中小組賽的 events/數據/陣容抓進 Redis，前端 /details 只讀此快取 */
  private async refreshLiveDetails(liveFixtures: ApiFixture[]) {
    const matches = await resolveLiveGroupMatches(this.prisma, liveFixtures);
    let ok = 0;
    for (const { fixtureId, matchNumber, homeNameEn } of matches) {
      try {
        const details = await fetchFixtureDetails(this.apiKey, fixtureId, homeNameEn);
        await this.redis.set(wcDetailsCacheKey(matchNumber), details, WorldCupCron.DETAILS_TTL);
        ok++;
      } catch (err) {
        this.logger.error(`世界盃細節刷新失敗（第 ${matchNumber} 場）：${err}`);
      }
    }
    if (matches.length) this.logger.log(`世界盃細節刷新：${ok}/${matches.length} 場寫入 Redis`);
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
