import { Controller, Post, Get, UseGuards, Logger, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@betting-forum/database';
import { ConfigService } from '@nestjs/config';
import { TranslationService, TranslatableEntity } from '../../translation/translation.service';
import { BASEBALL_LEAGUES, BaseballLeague, LEAGUE_DISPLAY_NAME } from './baseball-common.types';
import { LEAGUE_CONFIG } from '../sports.config';

interface SeedStatus {
  running: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  stats: Record<string, { teams: number; players: number; errors: string[] }>;
  currentStep: string;
}

/**
 * 棒球通用翻譯播種（CPBL / NPB / KBO）
 * 資料來源：API-Sports
 */
@ApiTags('admin:baseball-seed')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/baseball-seed')
export class BaseballSeedController {
  private readonly logger = new Logger(BaseballSeedController.name);
  private readonly apiKey: string;

  private status: SeedStatus = {
    running: false,
    startedAt: null,
    finishedAt: null,
    stats: {},
    currentStep: 'idle',
  };

  constructor(
    private config: ConfigService,
    private translation: TranslationService,
  ) {
    this.apiKey = this.config.get<string>('API_SPORTS_KEY', '');
  }

  @Post('all')
  @ApiOperation({ summary: '播種所有非 MLB 棒球聯賽翻譯（CPBL/NPB/KBO）' })
  async startSeed(@Body() body: { leagues?: string[] } = {}) {
    if (this.status.running) {
      return { success: false, message: '已有播種任務執行中', data: this.status };
    }

    const targetLeagues = (body.leagues ?? [...BASEBALL_LEAGUES]).filter(
      (l) => BASEBALL_LEAGUES.includes(l as BaseballLeague),
    ) as BaseballLeague[];

    this.status = {
      running: true,
      startedAt: new Date(),
      finishedAt: null,
      stats: {},
      currentStep: '準備中',
    };

    // 背景執行
    this.runSeed(targetLeagues).catch((err) => {
      this.logger.error(`[Baseball Seed] 失敗：${err}`);
      this.status.running = false;
      this.status.finishedAt = new Date();
      this.status.currentStep = '失敗';
    });

    return {
      success: true,
      message: `已啟動翻譯播種（${targetLeagues.join(', ')}），請用 GET /admin/baseball-seed/status 查詢`,
      data: this.status,
    };
  }

  @Get('status')
  @ApiOperation({ summary: '查詢播種進度' })
  async getStatus() {
    const monthlyCost = await this.translation.getMonthlyCost();
    return { data: { ...this.status, monthlyCost } };
  }

  private async runSeed(leagues: BaseballLeague[]) {
    try {
      for (const league of leagues) {
        const cfg = LEAGUE_CONFIG[league];
        if (!cfg) continue;

        const displayName = LEAGUE_DISPLAY_NAME[league];
        this.status.stats[league] = { teams: 0, players: 0, errors: [] };

        // ========== Step 1: 翻譯球隊 ==========
        this.status.currentStep = `${displayName}：翻譯球隊`;
        this.logger.log(`[Baseball Seed] ${this.status.currentStep}`);

        const teamsRes = await this.callApiSports('/teams', {
          league: cfg.leagueId,
          season: cfg.season,
        });

        if (teamsRes) {
          const entities: TranslatableEntity[] = teamsRes.map((t: any) => ({
            entityType: 'team' as const,
            apiId: t.id,
            nameEn: t.name,
            sport: 'baseball',
            logo: t.logo,
            extra: { league, leagueId: cfg.leagueId },
          }));

          const missing = await this.translation.findMissing(entities);
          if (missing.length > 0) {
            this.status.stats[league].teams = await this.translation.translateBatch(missing);
          } else {
            this.status.stats[league].teams = entities.length;
            this.logger.log(`[Baseball Seed] ${displayName} 球隊已全部翻譯`);
          }
        }

        // ========== Step 2: 翻譯球員（如有） ==========
        this.status.currentStep = `${displayName}：翻譯球員`;
        this.logger.log(`[Baseball Seed] ${this.status.currentStep}`);

        const playersRes = await this.callApiSports('/players', {
          league: cfg.leagueId,
          season: cfg.season,
        });

        if (playersRes && Array.isArray(playersRes)) {
          const playerEntities: TranslatableEntity[] = playersRes.map((p: any) => ({
            entityType: 'player' as const,
            apiId: p.id,
            nameEn: p.name,
            sport: 'baseball',
            extra: {
              league,
              teamId: p.team?.id,
              teamName: p.team?.name,
            },
          }));

          const missingPlayers = await this.translation.findMissing(playerEntities);
          this.status.currentStep = `${displayName}：翻譯 ${missingPlayers.length} 位球員`;
          this.logger.log(`[Baseball Seed] ${displayName} 待翻譯：${missingPlayers.length}/${playerEntities.length}`);

          if (missingPlayers.length > 0) {
            const BATCH = 50;
            for (let i = 0; i < missingPlayers.length; i += BATCH) {
              const batch = missingPlayers.slice(i, i + BATCH);
              const count = await this.translation.translateBatch(batch);
              this.status.stats[league].players += count;
              this.status.currentStep = `${displayName}：已翻譯 ${this.status.stats[league].players}/${missingPlayers.length} 位球員`;
            }
          }
        }

        this.logger.log(
          `[Baseball Seed] ${displayName} 完成：球隊 ${this.status.stats[league].teams}，球員 ${this.status.stats[league].players}`,
        );
      }

      this.status.currentStep = '全部完成';
    } catch (err) {
      this.logger.error(`[Baseball Seed] 失敗：${err}`);
      this.status.currentStep = '失敗';
    } finally {
      this.status.running = false;
      this.status.finishedAt = new Date();
    }
  }

  private async callApiSports(endpoint: string, params: Record<string, string | number>): Promise<any[] | null> {
    if (!this.apiKey) {
      this.logger.warn('API_SPORTS_KEY 未設定，跳過 API-Sports 呼叫');
      return null;
    }

    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) query.set(k, String(v));
    const url = `https://v1.baseball.api-sports.io${endpoint}?${query}`;

    try {
      const res = await fetch(url, {
        headers: { 'x-apisports-key': this.apiKey },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        this.logger.error(`API-Sports ${res.status}：${await res.text()}`);
        return null;
      }
      const data = await res.json() as { response: any[] };
      return data.response;
    } catch (err) {
      this.logger.error(`API-Sports 呼叫失敗：${err}`);
      return null;
    }
  }
}
