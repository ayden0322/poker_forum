import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MLBStatsService } from './mlb-stats.service';
import { TranslationService, TranslatableEntity } from '../../translation/translation.service';

/**
 * MLB 先發名單預翻譯排程
 *
 * 目的：避免比賽頁面第一位讀者載入時要等 3~5 秒（即時補翻 fallback）。
 * 流程：定期掃今/明兩日所有 MLB 比賽的 probablePitcher + lineups，
 *      把尚未翻譯的球員一次送 Claude 翻譯並寫入 DB。
 *
 * 頻率：每 6 小時一次（涵蓋一天內各時段公布的打線）。
 * 成本：~$0.005~0.02 / 次（多數時段全 hit cache 時為 0）。
 */
@Injectable()
export class MLBTranslationCron {
  private readonly logger = new Logger(MLBTranslationCron.name);

  constructor(
    private mlbStats: MLBStatsService,
    private translation: TranslationService,
  ) {}

  /** 每 6 小時整點執行 */
  @Cron('0 */6 * * *', { name: 'mlb-preview-translate' })
  async preTranslate() {
    const startedAt = Date.now();
    this.logger.log('[MLB Pre-Translate] 開始掃描今明 MLB 先發名單');

    try {
      // 抓昨天 / 今天 / 明天三日（覆蓋台灣 vs 美東時差造成的日界線跨越）
      const now = new Date();
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const dates = [
        fmt(new Date(now.getTime() - 24 * 3600 * 1000)),
        fmt(now),
        fmt(new Date(now.getTime() + 24 * 3600 * 1000)),
      ];

      const games = await this.mlbStats.getRawSchedulesWithPreview(dates);
      if (games.length === 0) {
        this.logger.log('[MLB Pre-Translate] 三日內無比賽，結束');
        return;
      }

      // 收集球員（id → { fullName, teamId }）
      const playerMap = new Map<number, { fullName: string; teamId?: number }>();
      for (const g of games) {
        for (const side of ['home', 'away'] as const) {
          const teamId = g.teams?.[side]?.team?.id;
          const pp = g.teams?.[side]?.probablePitcher;
          if (pp?.id && pp.fullName && !playerMap.has(pp.id)) {
            playerMap.set(pp.id, { fullName: pp.fullName, teamId });
          }
          const lineupKey = side === 'home' ? 'homePlayers' : 'awayPlayers';
          const lineup = g.lineups?.[lineupKey] ?? [];
          for (const p of lineup) {
            if (p?.id && p.fullName && !playerMap.has(p.id)) {
              playerMap.set(p.id, { fullName: p.fullName, teamId });
            }
          }
        }
      }

      if (playerMap.size === 0) {
        this.logger.log('[MLB Pre-Translate] 三日內無已公布的投手與打線，結束');
        return;
      }

      const entities: TranslatableEntity[] = Array.from(playerMap.entries()).map(
        ([id, info]) => ({
          entityType: 'player' as const,
          apiId: id,
          nameEn: info.fullName,
          sport: 'baseball',
          extra: info.teamId ? { mlbTeamId: info.teamId } : undefined,
        }),
      );

      const missing = await this.translation.findMissing(entities);
      if (missing.length === 0) {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        this.logger.log(
          `[MLB Pre-Translate] 全數已翻譯（共 ${entities.length} 位），耗時 ${elapsed}s`,
        );
        return;
      }

      const translated = await this.translation.translateBatch(missing, {
        triggeredBy: 'cron',
      });
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      this.logger.log(
        `[MLB Pre-Translate] 完成：總 ${entities.length} 位，新翻譯 ${translated}/${missing.length} 位，耗時 ${elapsed}s`,
      );
    } catch (err) {
      this.logger.error(`[MLB Pre-Translate] 失敗：${err}`);
    }
  }
}
