import { Controller, Post, UseGuards, Logger, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@betting-forum/database';
import { PrismaService } from '../../common/prisma.service';
import { ConfigService } from '@nestjs/config';
import { MLBStatsService } from './mlb-stats.service';
import { TranslationService, TranslatableEntity } from '../../translation/translation.service';

/**
 * MLB 一次性 Seed 端點（管理員專用）
 * 正式環境呼叫一次，完成：
 *  1. 從 API-Sports 拉球隊，翻譯存入 DB
 *  2. 從 MLB 官方拉球隊，建立 mlbStatsTeamId 對應到既有 team translation
 *  3. 從 MLB 官方拉所有 Roster，批次翻譯球員
 */
@ApiTags('admin:mlb-seed')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/mlb-seed')
export class MLBSeedController {
  private readonly logger = new Logger(MLBSeedController.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mlbStats: MLBStatsService,
    private translation: TranslationService,
  ) {}

  @Post('all')
  @ApiOperation({ summary: '一次性執行 MLB 所有翻譯（球隊 + 球員 + ID 對應）' })
  async seedAll(@Body() body: { season?: number } = {}) {
    const season = body.season ?? new Date().getFullYear();
    const stats = {
      teamsTranslated: 0,
      teamIdsMapped: 0,
      playersTranslated: 0,
      errors: [] as string[],
    };

    try {
      // ========== Step 1: 從 API-Sports 拉球隊並翻譯 ==========
      this.logger.log('[MLB Seed] Step 1: 翻譯 API-Sports 球隊...');
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
            stats.teamsTranslated = await this.translation.translateBatch(missing);
          }
        }
      }

      // ========== Step 2: 建立 MLB 官方 ID 對應 ==========
      this.logger.log('[MLB Seed] Step 2: 建立球隊 ID 對應...');
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
          if (currentExtra.mlbStatsTeamId === mlbTeam.id) continue; // 已對應過

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
          stats.teamIdsMapped++;
        }
      }

      // ========== Step 3: 從 MLB 官方拉球員並翻譯 ==========
      this.logger.log('[MLB Seed] Step 3: 翻譯 MLB 球員...');
      if (mlbTeams && mlbTeams.length > 0) {
        const allPlayers: TranslatableEntity[] = [];
        const playerIdToTeam = new Map<number, { teamId: number; position?: string; jerseyNumber?: string }>();

        for (const team of mlbTeams) {
          const roster = await this.mlbStats.getRoster(team.id, season);
          if (!roster) continue;
          for (const entry of roster) {
            const pid = entry.person?.id;
            if (!pid) continue;
            if (!playerIdToTeam.has(pid)) {
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
              playerIdToTeam.set(pid, {
                teamId: team.id,
                position: entry.position?.abbreviation,
                jerseyNumber: entry.jerseyNumber,
              });
            }
          }
        }

        const missingPlayers = await this.translation.findMissing(allPlayers);
        this.logger.log(`[MLB Seed] 待翻譯球員：${missingPlayers.length}/${allPlayers.length}`);

        if (missingPlayers.length > 0) {
          stats.playersTranslated = await this.translation.translateBatch(missingPlayers);
        }
      }

      const usage = await this.translation.getMonthlyCost();

      this.logger.log(
        `[MLB Seed] 完成！球隊翻譯 ${stats.teamsTranslated}，ID 對應 ${stats.teamIdsMapped}，球員翻譯 ${stats.playersTranslated}`,
      );

      return {
        success: true,
        data: {
          ...stats,
          monthlyCost: usage,
        },
      };
    } catch (err) {
      this.logger.error(`[MLB Seed] 失敗：${err}`);
      stats.errors.push(String(err));
      return { success: false, data: stats };
    }
  }
}
