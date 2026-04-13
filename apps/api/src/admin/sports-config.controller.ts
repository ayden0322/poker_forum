import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Post,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsNumber, IsObject } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@betting-forum/database';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../common/prisma.service';
import { ConfigService } from '@nestjs/config';
import { SPORT_CONFIG } from '../sports/sports.config';

class UpdateSportsConfigDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() apiHost?: string;
  @IsOptional() @IsNumber() leagueId?: number;
  @IsOptional() @IsString() season?: string;
  @IsOptional() @IsObject() cacheTtl?: Record<string, number>;
  @IsOptional() @IsObject() extraConfig?: Record<string, any>;
}

/** 預設設定：首次載入時寫入資料庫 */
const DEFAULT_CONFIGS = [
  {
    sportType: 'baseball',
    displayName: '棒球（MLB）',
    apiHost: 'v1.baseball.api-sports.io',
    leagueId: 1,
    season: String(new Date().getFullYear()),
    cacheTtl: { live: 60, schedule: 300, standings: 600, players: 3600 },
  },
  {
    sportType: 'basketball',
    displayName: '籃球（NBA）',
    apiHost: 'v2.nba.api-sports.io',
    leagueId: 12,
    season: `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`,
    cacheTtl: { live: 60, schedule: 300, standings: 600, players: 3600 },
  },
  {
    sportType: 'soccer',
    displayName: '足球（英超）',
    apiHost: 'v3.football.api-sports.io',
    leagueId: 39,
    season: String(new Date().getFullYear()),
    cacheTtl: { live: 60, schedule: 300, standings: 600, players: 3600, odds: 120 },
  },
];

@ApiTags('admin:sports-config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/sports-config')
export class AdminSportsConfigController {
  private readonly logger = new Logger(AdminSportsConfigController.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: '取得所有運動 API 設定' })
  async getAll(): Promise<{ data: unknown[] }> {
    // 確保預設設定存在
    await this.ensureDefaults();

    const configs = await this.prisma.sportsConfig.findMany({
      orderBy: { sportType: 'asc' },
    });

    return { data: configs };
  }

  @Get('usage')
  @ApiOperation({ summary: '查詢 API-Sports 各運動 API 使用量' })
  async getUsage() {
    const apiKey = this.config.get<string>('API_SPORTS_KEY', '');
    if (!apiKey) {
      return { data: { error: 'API_SPORTS_KEY 未設定' } };
    }

    const configs = await this.prisma.sportsConfig.findMany({ where: { enabled: true } });
    const usage: Record<string, unknown> = {};

    for (const cfg of configs) {
      try {
        const res = await fetch(`https://${cfg.apiHost}/status`, {
          headers: { 'x-apisports-key': apiKey },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json() as { response: unknown };
          usage[cfg.sportType] = data.response;
        } else {
          usage[cfg.sportType] = { error: `HTTP ${res.status}` };
        }
      } catch (err) {
        usage[cfg.sportType] = { error: String(err) };
      }
    }

    return { data: usage };
  }

  @Put(':sportType')
  @ApiOperation({ summary: '更新指定運動的 API 設定' })
  async update(
    @Param('sportType') sportType: string,
    @Body() dto: UpdateSportsConfigDto,
    @CurrentUser() user: { id: string },
  ): Promise<{ data?: unknown; error?: string }> {
    const existing = await this.prisma.sportsConfig.findUnique({
      where: { sportType },
    });

    if (!existing) {
      return { error: `找不到 ${sportType} 的設定` };
    }

    const updated = await this.prisma.sportsConfig.update({
      where: { sportType },
      data: {
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.apiHost && { apiHost: dto.apiHost }),
        ...(dto.leagueId !== undefined && { leagueId: dto.leagueId }),
        ...(dto.season && { season: dto.season }),
        ...(dto.cacheTtl && { cacheTtl: dto.cacheTtl }),
        ...(dto.extraConfig !== undefined && { extraConfig: dto.extraConfig }),
        updatedBy: user.id,
      },
    });

    this.logger.log(`管理員 ${user.id} 更新了 ${sportType} 的設定`);
    return { data: updated };
  }

  @Post('seed')
  @ApiOperation({ summary: '重置為預設設定' })
  async seed(@CurrentUser() user: { id: string }): Promise<{ data: unknown[] }> {
    for (const cfg of DEFAULT_CONFIGS) {
      await this.prisma.sportsConfig.upsert({
        where: { sportType: cfg.sportType },
        create: { ...cfg, updatedBy: user.id },
        update: { ...cfg, updatedBy: user.id },
      });
    }
    this.logger.log(`管理員 ${user.id} 重置了所有運動 API 設定`);

    const configs = await this.prisma.sportsConfig.findMany({
      orderBy: { sportType: 'asc' },
    });
    return { data: configs };
  }

  /** 確保資料庫中有預設設定 */
  private async ensureDefaults() {
    const count = await this.prisma.sportsConfig.count();
    if (count > 0) return;

    this.logger.log('首次載入，寫入預設運動 API 設定');
    for (const cfg of DEFAULT_CONFIGS) {
      await this.prisma.sportsConfig.create({ data: cfg });
    }
  }
}
