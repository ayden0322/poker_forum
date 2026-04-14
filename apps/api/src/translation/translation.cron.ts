import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { ConfigService } from '@nestjs/config';
import { TranslationService, TranslatableEntity, EntityType } from './translation.service';
import { LEAGUE_CONFIG, API_HOSTS } from '../sports/sports.config';

/**
 * 每小時掃描並翻譯 API-Sports 新出現的實體
 * 流程：
 * 1. 撈取目前所有 enabled 的聯賽
 * 2. 對每個聯賽呼叫 API 拉球隊、球員、教練
 * 3. 比對 DB，找出未翻譯的實體
 * 4. 批次送 Claude 翻譯
 */
@Injectable()
export class TranslationCron {
  private readonly logger = new Logger(TranslationCron.name);
  private readonly apiKey: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private translation: TranslationService,
  ) {
    this.apiKey = this.config.get<string>('API_SPORTS_KEY', '');
  }

  /** 每小時整點執行 */
  @Cron(CronExpression.EVERY_HOUR)
  async hourlyTranslation() {
    this.logger.log('開始每小時翻譯排程');
    const startedAt = Date.now();

    try {
      // 從程式碼預設 + DB 覆蓋取得所有聯賽
      const leagues = await this.getActiveLeagues();

      let totalNew = 0;
      for (const league of leagues) {
        const count = await this.processLeague(league);
        totalNew += count;
      }

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      this.logger.log(`每小時翻譯完成，新翻譯 ${totalNew} 個實體，耗時 ${elapsed}s`);
    } catch (err) {
      this.logger.error(`每小時翻譯失敗：${err}`);
    }
  }

  /** 取得目前啟用的聯賽設定 */
  private async getActiveLeagues() {
    const dbConfigs = await this.prisma.sportsConfig.findMany({
      where: { enabled: true },
    });

    return dbConfigs.map((c) => ({
      boardSlug: c.boardSlug,
      sportType: c.sportType,
      apiHost: c.apiHost,
      leagueId: c.leagueId,
      season: c.season,
    }));
  }

  /** 處理單一聯賽的實體翻譯 */
  private async processLeague(league: {
    boardSlug: string;
    sportType: string;
    apiHost: string;
    leagueId: number;
    season: string;
  }): Promise<number> {
    this.logger.debug(`處理聯賽 ${league.boardSlug}（league=${league.leagueId}）`);

    const entities: TranslatableEntity[] = [];

    // 1. 球隊
    const teams = await this.fetchTeams(league);
    for (const team of teams) {
      entities.push({
        entityType: 'team',
        apiId: team.id,
        nameEn: team.name,
        sport: league.sportType,
        logo: team.logo,
      });
    }

    // 2. 球員（只針對球隊球員清單）
    for (const team of teams.slice(0, 30)) {
      // 最多只處理 30 支隊伍的球員，避免一次呼叫太多
      const players = await this.fetchPlayers(league, team.id);
      for (const player of players) {
        entities.push({
          entityType: 'player',
          apiId: player.id,
          nameEn: player.name,
          sport: league.sportType,
          logo: player.photo ?? player.logo,
          extra: player.position ? { position: player.position } : undefined,
        });
      }
    }

    // 3. 找出未翻譯的
    const missing = await this.translation.findMissing(entities);

    if (missing.length === 0) {
      this.logger.debug(`${league.boardSlug} 無新實體需要翻譯`);
      return 0;
    }

    this.logger.log(`${league.boardSlug} 發現 ${missing.length} 個未翻譯實體，準備翻譯`);

    // 4. 按 entityType 分批翻譯
    const byType = new Map<EntityType, TranslatableEntity[]>();
    for (const e of missing) {
      if (!byType.has(e.entityType)) byType.set(e.entityType, []);
      byType.get(e.entityType)!.push(e);
    }

    let total = 0;
    for (const [type, list] of byType) {
      const count = await this.translation.translateBatch(list);
      this.logger.log(`${league.boardSlug} ${type}: 翻譯 ${count}/${list.length}`);
      total += count;
    }

    return total;
  }

  /** 從 API-Sports 拉該聯賽的球隊 */
  private async fetchTeams(league: {
    sportType: string;
    apiHost: string;
    leagueId: number;
    season: string;
  }): Promise<Array<{ id: number; name: string; logo?: string }>> {
    try {
      const url = `https://${league.apiHost}/teams?league=${league.leagueId}&season=${league.season}`;
      const res = await fetch(url, {
        headers: { 'x-apisports-key': this.apiKey },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { response: any[] };
      const response = data.response ?? [];

      // 不同運動的回傳結構略有不同
      if (league.sportType === 'football') {
        // { team: {...}, venue: {...} }
        return response.map((r) => ({
          id: r.team?.id,
          name: r.team?.name,
          logo: r.team?.logo,
        })).filter((t) => t.id);
      }

      // basketball / baseball: 直接 { id, name, logo }
      return response.map((r: any) => ({
        id: r.id,
        name: r.name,
        logo: r.logo,
      })).filter((t: any) => t.id);
    } catch (err) {
      this.logger.error(`取得球隊失敗 ${league.leagueId}：${err}`);
      return [];
    }
  }

  /** 從 API-Sports 拉該球隊的球員 */
  private async fetchPlayers(
    league: { sportType: string; apiHost: string; leagueId: number; season: string },
    teamId: number,
  ): Promise<Array<{ id: number; name: string; photo?: string; logo?: string; position?: string }>> {
    try {
      // football: /players/squads?team=X
      // basketball/baseball: /players?team=X&season=Y
      const url =
        league.sportType === 'football'
          ? `https://${league.apiHost}/players/squads?team=${teamId}`
          : `https://${league.apiHost}/players?team=${teamId}&season=${league.season}`;

      const res = await fetch(url, {
        headers: { 'x-apisports-key': this.apiKey },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { response: any[] };
      const response = data.response ?? [];

      if (league.sportType === 'football') {
        // response[0].players[] = [{ id, name, photo, position }, ...]
        const players = response[0]?.players ?? [];
        return players.map((p: any) => ({
          id: p.id,
          name: p.name,
          photo: p.photo,
          position: p.position,
        })).filter((p: any) => p.id);
      }

      // basketball / baseball: 直接 { id, name, ... }
      return response.map((p: any) => ({
        id: p.id,
        name: `${p.firstname ?? ''} ${p.lastname ?? ''}`.trim() || p.name,
        photo: p.photo,
        position: p.position,
      })).filter((p: any) => p.id);
    } catch (err) {
      this.logger.error(`取得球員失敗 team=${teamId}：${err}`);
      return [];
    }
  }
}
