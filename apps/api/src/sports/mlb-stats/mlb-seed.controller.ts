import { Controller, Post, Get, UseGuards, Logger, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@betting-forum/database';
import { PrismaService } from '../../common/prisma.service';
import { ConfigService } from '@nestjs/config';
import { MLBStatsService } from './mlb-stats.service';
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
 * MLB 一次性 Seed 端點（管理員專用）
 * 非同步執行 - 不阻塞前端，可隨時查詢進度
 */
@ApiTags('admin:mlb-seed')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/mlb-seed')
export class MLBSeedController {
  private readonly logger = new Logger(MLBSeedController.name);

  // 全域狀態（單例 controller）
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
    private mlbStats: MLBStatsService,
    private translation: TranslationService,
  ) {}

  @Post('all')
  @ApiOperation({ summary: '啟動 MLB 所有翻譯（非同步，立刻回傳）' })
  async startSeed(@Body() body: { season?: number } = {}) {
    if (this.status.running) {
      return {
        success: false,
        message: '已有 seed 任務執行中',
        data: this.status,
      };
    }

    const season = body.season ?? new Date().getFullYear();

    // 重置狀態並啟動背景任務
    this.status = {
      running: true,
      startedAt: new Date(),
      finishedAt: null,
      stats: { teamsTranslated: 0, teamIdsMapped: 0, playersTranslated: 0, errors: [] },
      currentStep: 'Step 1: 翻譯球隊',
    };

    // 不 await，讓它在背景跑
    this.runSeed(season).catch((err) => {
      this.logger.error(`[MLB Seed] 執行失敗：${err}`);
      this.status.stats.errors.push(String(err));
      this.status.running = false;
      this.status.finishedAt = new Date();
    });

    return {
      success: true,
      message: '已啟動 MLB 翻譯任務，請用 GET /admin/mlb-seed/status 查詢進度',
      data: this.status,
    };
  }

  @Get('status')
  @ApiOperation({ summary: '查詢 seed 進度' })
  async getStatus() {
    const monthlyCost = await this.translation.getMonthlyCost();
    return { data: { ...this.status, monthlyCost } };
  }

  /** 實際執行 seed（背景任務） */
  private async runSeed(season: number) {
    try {
      // ========== Step 1: 從 API-Sports 拉球隊並翻譯 ==========
      this.status.currentStep = 'Step 1: 翻譯 API-Sports 球隊';
      this.logger.log(`[MLB Seed] ${this.status.currentStep}`);

      const apiSportsKey = this.config.get<string>('API_SPORTS_KEY');
      if (apiSportsKey) {
        const res = await fetch(
          `https://v1.baseball.api-sports.io/teams?league=1&season=${season}`,
          { headers: { 'x-apisports-key': apiSportsKey }, signal: AbortSignal.timeout(15000) },
        );
        if (res.ok) {
          const data = (await res.json()) as { response: any[] };
          const apiSportsTeams: TranslatableEntity[] = data.response.map((t: any) => ({
            entityType: 'team' as const,
            apiId: t.id,
            nameEn: t.name,
            sport: 'baseball',
            logo: t.logo,
          }));
          const missing = await this.translation.findMissing(apiSportsTeams);
          if (missing.length > 0) {
            this.status.stats.teamsTranslated = await this.translation.translateBatch(missing);
          }
        }
      }

      // ========== Step 2: 建立 MLB 官方 ID 對應 ==========
      this.status.currentStep = 'Step 2: 建立球隊 ID 對應';
      this.logger.log(`[MLB Seed] ${this.status.currentStep}`);

      const mlbTeams = await this.mlbStats.getAllTeams(season);
      if (mlbTeams && mlbTeams.length > 0) {
        const apiSportsTeams = await this.prisma.translation.findMany({
          where: { entityType: 'team', sport: 'baseball' },
        });

        const normalize = (s: string) =>
          s.toLowerCase().replace(/\s+/g, '').replace(/\./g, '').trim();

        const mlbByName = new Map<string, any>();
        for (const t of mlbTeams) {
          mlbByName.set(normalize(t.name), t);
          if (t.teamName) mlbByName.set(normalize(t.teamName), t);
        }

        for (const team of apiSportsTeams) {
          let mlbTeam = mlbByName.get(normalize(team.nameEn));
          if (!mlbTeam) {
            const nameOnly = team.nameEn.split(' ').slice(-1)[0];
            mlbTeam = mlbByName.get(normalize(nameOnly));
          }
          if (!mlbTeam) continue;

          const currentExtra = (team.extra as Record<string, any>) ?? {};
          if (currentExtra.mlbStatsTeamId === mlbTeam.id) continue;

          await this.prisma.translation.update({
            where: { id: team.id },
            data: {
              extra: {
                ...currentExtra,
                mlbStatsTeamId: mlbTeam.id,
                mlbAbbr: mlbTeam.abbreviation,
              },
            },
          });
          this.status.stats.teamIdsMapped++;
        }
      }

      // ========== Step 3: 從 MLB 官方拉球員並翻譯 ==========
      this.status.currentStep = 'Step 3: 拉 Roster 並翻譯球員';
      this.logger.log(`[MLB Seed] ${this.status.currentStep}`);

      if (mlbTeams && mlbTeams.length > 0) {
        const allPlayers: TranslatableEntity[] = [];
        const seen = new Set<number>();

        for (const team of mlbTeams) {
          const roster = await this.mlbStats.getRoster(team.id, season);
          if (!roster) continue;
          for (const entry of roster) {
            const pid = entry.person?.id;
            if (!pid || seen.has(pid)) continue;
            seen.add(pid);
            allPlayers.push({
              entityType: 'player',
              apiId: pid,
              nameEn: entry.person.fullName,
              sport: 'baseball',
              extra: {
                position: entry.position?.abbreviation,
                jerseyNumber: entry.jerseyNumber,
                mlbTeamId: team.id,
              },
            });
          }
        }

        const missingPlayers = await this.translation.findMissing(allPlayers);
        this.status.currentStep = `Step 3: 翻譯 ${missingPlayers.length} 位球員`;
        this.logger.log(`[MLB Seed] 待翻譯球員：${missingPlayers.length}/${allPlayers.length}`);

        if (missingPlayers.length > 0) {
          // 分批翻譯 + 更新進度
          const BATCH = 50;
          for (let i = 0; i < missingPlayers.length; i += BATCH) {
            const batch = missingPlayers.slice(i, i + BATCH);
            const count = await this.translation.translateBatch(batch);
            this.status.stats.playersTranslated += count;
            this.status.currentStep = `Step 3: 已翻譯 ${this.status.stats.playersTranslated}/${missingPlayers.length} 位球員`;
          }
        }
      }

      this.status.currentStep = '完成';
      this.logger.log(
        `[MLB Seed] 完成！球隊翻譯 ${this.status.stats.teamsTranslated}，ID 對應 ${this.status.stats.teamIdsMapped}，球員翻譯 ${this.status.stats.playersTranslated}`,
      );
    } catch (err) {
      this.logger.error(`[MLB Seed] 失敗：${err}`);
      this.status.stats.errors.push(String(err));
      this.status.currentStep = '失敗';
    } finally {
      this.status.running = false;
      this.status.finishedAt = new Date();
    }
  }
}
