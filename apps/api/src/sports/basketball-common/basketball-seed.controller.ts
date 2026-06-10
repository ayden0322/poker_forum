import { Controller, Post, Get, UseGuards, Logger, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@betting-forum/database';
import { ConfigService } from '@nestjs/config';
import { TranslationService, TranslatableEntity } from '../../translation/translation.service';
import { LEAGUE_CONFIG, API_HOSTS } from '../sports.config';
import { listApiSportsBasketballLeagues } from './basketball-common.types';

interface SeedStatus {
  running: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  stats: Record<string, { teams: number; errors: string[] }>;
  currentStep: string;
}

/**
 * 籃球通用翻譯播種（API-Sports 各聯賽球隊中文名）
 *
 * 只翻球隊（籃球 /players 需帶 team、無聯盟級名單，球員翻譯延到球員頁階段）。
 * TPBL 不在此（官方源隊名本來就是中文）。
 */
@ApiTags('admin:basketball-seed')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/basketball-seed')
export class BasketballSeedController {
  private readonly logger = new Logger(BasketballSeedController.name);
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
  @ApiOperation({ summary: '播種 API-Sports 籃球聯賽球隊中文名（預設全部；可帶 leagues 指定）' })
  async startSeed(@Body() body: { leagues?: string[] } = {}) {
    if (this.status.running) {
      return { success: false, message: '已有播種任務執行中', data: this.status };
    }

    const all = listApiSportsBasketballLeagues();
    const targetLeagues = (body.leagues ?? all).filter((l) => all.includes(l));

    this.status = {
      running: true,
      startedAt: new Date(),
      finishedAt: null,
      stats: {},
      currentStep: '準備中',
    };

    this.runSeed(targetLeagues).catch((err) => {
      this.logger.error(`[Basketball Seed] 失敗：${err}`);
      this.status.running = false;
      this.status.finishedAt = new Date();
      this.status.currentStep = '失敗';
    });

    return {
      success: true,
      message: `已啟動翻譯播種（${targetLeagues.join(', ')}），請用 GET /admin/basketball-seed/status 查詢`,
      data: this.status,
    };
  }

  @Get('status')
  @ApiOperation({ summary: '查詢播種進度' })
  async getStatus() {
    const monthlyCost = await this.translation.getMonthlyCost();
    return { data: { ...this.status, monthlyCost } };
  }

  private async runSeed(leagues: string[]) {
    try {
      for (const league of leagues) {
        const cfg = LEAGUE_CONFIG[league];
        if (!cfg) continue;

        const displayName = cfg.displayName;
        this.status.stats[league] = { teams: 0, errors: [] };
        this.status.currentStep = `${displayName}：翻譯球隊`;
        this.logger.log(`[Basketball Seed] ${this.status.currentStep}`);

        const teamsRes = await this.callApiSports('/teams', {
          league: cfg.leagueId,
          season: cfg.season,
        });

        if (teamsRes && Array.isArray(teamsRes)) {
          const entities: TranslatableEntity[] = teamsRes.map((t: any) => ({
            entityType: 'team' as const,
            apiId: t.id,
            nameEn: t.name,
            sport: 'basketball',
            logo: t.logo,
            extra: { league, leagueId: cfg.leagueId },
          }));

          const missing = await this.translation.findMissing(entities);
          if (missing.length > 0) {
            this.status.stats[league].teams = await this.translation.translateBatch(missing);
          } else {
            this.status.stats[league].teams = entities.length;
            this.logger.log(`[Basketball Seed] ${displayName} 球隊已全部翻譯`);
          }
        }

        this.logger.log(`[Basketball Seed] ${displayName} 完成：球隊 ${this.status.stats[league].teams}`);
      }

      this.status.currentStep = '全部完成';
    } catch (err) {
      this.logger.error(`[Basketball Seed] 失敗：${err}`);
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
    const url = `https://${API_HOSTS.basketball}${endpoint}?${query}`;

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
