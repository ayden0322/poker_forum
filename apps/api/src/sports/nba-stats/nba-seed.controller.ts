import { Controller, Post, Get, UseGuards, Logger, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@betting-forum/database';
import { PrismaService } from '../../common/prisma.service';
import { ConfigService } from '@nestjs/config';
import { NBAStatsService } from './nba-stats.service';
import { TranslationService, TranslatableEntity } from '../../translation/translation.service';

interface SeedStatus {
  running: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  stats: {
    teamsTranslated: number;
    teamIdsMapped: number;
    playersTranslated: number;
    errors: string[];
  };
  currentStep: string;
}

/**
 * NBA 一次性 Seed 端點（管理員專用）
 *
 * 流程：
 *  Step 1：拉 API-Sports basketball v1 30 隊（已是英文名）→ 翻譯為中文
 *  Step 2：拉 ESPN 30 隊 → 用英文名 fuzzy match → 把 ESPN team ID 寫入 Translation.extra
 *  Step 3（選用）：拉每隊 ESPN roster → 翻譯球員
 */
@ApiTags('admin:nba-seed')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/nba-seed')
export class NBASeedController {
  private readonly logger = new Logger(NBASeedController.name);

  private status: SeedStatus = {
    running: false,
    startedAt: null,
    finishedAt: null,
    stats: { teamsTranslated: 0, teamIdsMapped: 0, playersTranslated: 0, errors: [] },
    currentStep: 'idle',
  };

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private nbaStats: NBAStatsService,
    private translation: TranslationService,
  ) {}

  @Post('all')
  @ApiOperation({ summary: '啟動 NBA 全套 seed（球隊翻譯 + ESPN ID 對應 + 陣容翻譯）' })
  async startSeed(@Body() body: { skipPlayers?: boolean } = {}) {
    if (this.status.running) {
      return { success: false, message: '已有 seed 任務執行中', data: this.status };
    }

    this.status = {
      running: true,
      startedAt: new Date(),
      finishedAt: null,
      stats: { teamsTranslated: 0, teamIdsMapped: 0, playersTranslated: 0, errors: [] },
      currentStep: 'Step 1: 翻譯 API-Sports 球隊',
    };

    this.runSeed(body.skipPlayers ?? false).catch((err) => {
      this.logger.error(`[NBA Seed] 失敗：${err}`);
      this.status.stats.errors.push(String(err));
      this.status.running = false;
      this.status.finishedAt = new Date();
    });

    return {
      success: true,
      message: '已啟動 NBA seed，請用 GET /admin/nba-seed/status 查進度',
      data: this.status,
    };
  }

  @Get('status')
  @ApiOperation({ summary: '查詢 seed 進度' })
  async getStatus() {
    const monthlyCost = await this.translation.getMonthlyCost();
    return { data: { ...this.status, monthlyCost } };
  }

  private async runSeed(skipPlayers: boolean) {
    try {
      // ========== Step 1：API-Sports 拉 NBA 球隊並翻譯 ==========
      this.status.currentStep = 'Step 1: 翻譯 API-Sports 球隊';
      this.logger.log(`[NBA Seed] ${this.status.currentStep}`);

      const apiKey = this.config.get<string>('API_SPORTS_KEY');
      let apiSportsTeams: any[] = [];

      if (apiKey) {
        // 免費方案 NBA 用 2023-2024 賽季撈球隊清單
        const res = await fetch(
          'https://v1.basketball.api-sports.io/teams?league=12&season=2023-2024',
          { headers: { 'x-apisports-key': apiKey }, signal: AbortSignal.timeout(15000) },
        );
        if (res.ok) {
          const json = (await res.json()) as { response: any[]; errors?: Record<string, string> | string[] };
          // API-Sports 即使配額爆 HTTP 200 但 response=[] + errors 帶訊息
          const errs = json.errors;
          const errMsg = Array.isArray(errs)
            ? null
            : errs && typeof errs === 'object'
              ? Object.values(errs).join('；')
              : null;
          if (errMsg) {
            this.status.stats.errors.push(`Step 1: ${errMsg}`);
            // 配額爆炸或其他 plan 限制 → 整個 seed 失敗，避免假性「完成」
            throw new Error(`API-Sports 拒絕：${errMsg}`);
          }
          apiSportsTeams = json.response ?? [];
          if (apiSportsTeams.length === 0) {
            this.status.stats.errors.push('Step 1: API-Sports 回傳 0 隊（可能是聯賽 ID/賽季有問題）');
            throw new Error('API-Sports 回傳 0 隊');
          }
          const entities: TranslatableEntity[] = apiSportsTeams.map((t: any) => ({
            entityType: 'team' as const,
            apiId: t.id,
            nameEn: t.name,
            sport: 'basketball',
            logo: t.logo,
          }));
          const missing = await this.translation.findMissing(entities);
          if (missing.length > 0) {
            this.status.stats.teamsTranslated = await this.translation.translateBatch(missing);
          }
        } else {
          this.status.stats.errors.push(`Step 1: API-Sports HTTP ${res.status}`);
          throw new Error(`API-Sports HTTP ${res.status}`);
        }
      }

      // ========== Step 2：拉 ESPN 30 隊並 ID mapping ==========
      this.status.currentStep = 'Step 2: 建立 ESPN ↔ API-Sports ID 對應';
      this.logger.log(`[NBA Seed] ${this.status.currentStep}`);

      const espnTeams = await this.nbaStats.getAllTeams();
      if (espnTeams && espnTeams.length > 0) {
        const translations = await this.prisma.translation.findMany({
          where: { entityType: 'team', sport: 'basketball' },
        });

        const normalize = (s: string) =>
          (s ?? '').toLowerCase().replace(/\s+/g, '').replace(/\./g, '').trim();

        const espnByName = new Map<string, any>();
        for (const t of espnTeams) {
          espnByName.set(normalize(t.displayName), t);
          espnByName.set(normalize(t.shortDisplayName), t);
          espnByName.set(normalize(t.nickname), t);
          espnByName.set(normalize(t.location), t);
        }

        for (const tr of translations) {
          let espnTeam = espnByName.get(normalize(tr.nameEn));
          if (!espnTeam) {
            const lastWord = tr.nameEn.split(' ').slice(-1)[0];
            espnTeam = espnByName.get(normalize(lastWord));
          }
          if (!espnTeam) continue;

          const currentExtra = (tr.extra as Record<string, any>) ?? {};
          if (currentExtra.espnTeamId === Number(espnTeam.id)) continue;

          await this.prisma.translation.update({
            where: { id: tr.id },
            data: {
              extra: {
                ...currentExtra,
                espnTeamId: Number(espnTeam.id),
                espnAbbr: espnTeam.abbreviation,
              },
            },
          });
          this.status.stats.teamIdsMapped++;
        }
      }

      // ========== Step 3：拉每隊 ESPN roster 並翻譯球員 ==========
      if (!skipPlayers && espnTeams && espnTeams.length > 0) {
        this.status.currentStep = 'Step 3: 拉 Roster 並翻譯球員';
        this.logger.log(`[NBA Seed] ${this.status.currentStep}`);

        const allPlayers: TranslatableEntity[] = [];
        const seen = new Set<number>();

        for (const team of espnTeams) {
          const roster = await this.nbaStats.getRoster(Number(team.id));
          if (!roster) continue;
          for (const p of roster) {
            const pid = Number(p.id);
            if (!pid || seen.has(pid)) continue;
            seen.add(pid);
            allPlayers.push({
              entityType: 'player',
              apiId: pid,
              nameEn: p.fullName ?? p.displayName,
              sport: 'basketball',
              extra: {
                espnPlayerId: pid,
                espnTeamId: Number(team.id),
                position: p.position?.abbreviation,
                jersey: p.jersey,
              },
            });
          }
        }

        const missing = await this.translation.findMissing(allPlayers);
        this.status.currentStep = `Step 3: 翻譯 ${missing.length} 位球員`;
        if (missing.length > 0) {
          const BATCH = 50;
          for (let i = 0; i < missing.length; i += BATCH) {
            const batch = missing.slice(i, i + BATCH);
            const count = await this.translation.translateBatch(batch);
            this.status.stats.playersTranslated += count;
            this.status.currentStep = `Step 3: 已翻譯 ${this.status.stats.playersTranslated}/${missing.length} 位球員`;
          }
        }
      }

      this.status.currentStep = '完成';
      this.logger.log(
        `[NBA Seed] 完成！球隊翻譯 ${this.status.stats.teamsTranslated}，ID 對應 ${this.status.stats.teamIdsMapped}，球員翻譯 ${this.status.stats.playersTranslated}`,
      );
    } catch (err) {
      this.logger.error(`[NBA Seed] 失敗：${err}`);
      this.status.stats.errors.push(String(err));
      this.status.currentStep = '失敗';
    } finally {
      this.status.running = false;
      this.status.finishedAt = new Date();
    }
  }
}
