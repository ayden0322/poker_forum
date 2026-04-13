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
import { LEAGUE_CONFIG } from '../sports/sports.config';

class UpdateSportsConfigDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() apiHost?: string;
  @IsOptional() @IsNumber() leagueId?: number;
  @IsOptional() @IsString() season?: string;
  @IsOptional() @IsObject() cacheTtl?: Record<string, number>;
  @IsOptional() @IsObject() extraConfig?: Record<string, any>;
}

/** 從 LEAGUE_CONFIG 產生預設設定 */
function buildDefaultConfigs() {
  return Object.entries(LEAGUE_CONFIG).map(([slug, cfg]) => ({
    boardSlug: slug,
    sportType: cfg.sportType,
    displayName: cfg.displayName,
    apiHost: cfg.apiHost,
    leagueId: cfg.leagueId,
    season: String(cfg.season),
    cacheTtl: { live: 60, schedule: 300, standings: 600, players: 3600, odds: 120 },
  }));
}

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
    await this.ensureDefaults();

    const configs = await this.prisma.sportsConfig.findMany({
      orderBy: [{ sportType: 'asc' }, { boardSlug: 'asc' }],
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

    // API-Sports 的使用量是按 API host 計算，不是按聯賽
    // 所以只需要查詢每個唯一的 host 一次
    const configs = await this.prisma.sportsConfig.findMany({ where: { enabled: true } });
    const hostSet = new Set<string>();
    const usage: Record<string, unknown> = {};

    for (const cfg of configs) {
      if (hostSet.has(cfg.apiHost)) {
        // 同一個 host 的使用量一樣，直接複製
        const existing = Object.entries(usage).find(
          ([, v]: [string, any]) => v && !v.error && configs.find((c) => c.boardSlug === Object.keys(usage).find((k) => usage[k] === v))?.apiHost === cfg.apiHost
        );
        if (existing) {
          usage[cfg.boardSlug] = existing[1];
        }
        continue;
      }

      hostSet.add(cfg.apiHost);
      try {
        const res = await fetch(`https://${cfg.apiHost}/status`, {
          headers: { 'x-apisports-key': apiKey },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json() as { response: unknown };
          usage[cfg.boardSlug] = data.response;
        } else {
          usage[cfg.boardSlug] = { error: `HTTP ${res.status}` };
        }
      } catch (err) {
        usage[cfg.boardSlug] = { error: String(err) };
      }
    }

    return { data: usage };
  }

  @Put(':boardSlug')
  @ApiOperation({ summary: '更新指定看板的 API 設定' })
  async update(
    @Param('boardSlug') boardSlug: string,
    @Body() dto: UpdateSportsConfigDto,
    @CurrentUser() user: { id: string },
  ): Promise<{ data?: unknown; error?: string }> {
    const existing = await this.prisma.sportsConfig.findUnique({
      where: { boardSlug },
    });

    if (!existing) {
      return { error: `找不到 ${boardSlug} 的設定` };
    }

    const updated = await this.prisma.sportsConfig.update({
      where: { boardSlug },
      data: {
        ...(dto.displayName && { displayName: dto.displayName }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.apiHost && { apiHost: dto.apiHost }),
        ...(dto.leagueId !== undefined && { leagueId: dto.leagueId }),
        ...(dto.season && { season: dto.season }),
        ...(dto.cacheTtl && { cacheTtl: dto.cacheTtl }),
        ...(dto.extraConfig !== undefined && { extraConfig: dto.extraConfig }),
        updatedBy: user.id,
      },
    });

    this.logger.log(`管理員 ${user.id} 更新了 ${boardSlug} 的設定`);
    return { data: updated };
  }

  @Post('seed')
  @ApiOperation({ summary: '重置為預設設定' })
  async seed(@CurrentUser() user: { id: string }): Promise<{ data: unknown[] }> {
    const defaults = buildDefaultConfigs();
    for (const cfg of defaults) {
      await this.prisma.sportsConfig.upsert({
        where: { boardSlug: cfg.boardSlug },
        create: { ...cfg, updatedBy: user.id },
        update: { ...cfg, updatedBy: user.id },
      });
    }
    this.logger.log(`管理員 ${user.id} 重置了所有運動 API 設定`);

    const configs = await this.prisma.sportsConfig.findMany({
      orderBy: [{ sportType: 'asc' }, { boardSlug: 'asc' }],
    });
    return { data: configs };
  }

  /** 確保資料庫中有預設設定 */
  private async ensureDefaults() {
    const count = await this.prisma.sportsConfig.count();
    if (count > 0) return;

    this.logger.log('首次載入，寫入預設運動 API 設定');
    const defaults = buildDefaultConfigs();
    for (const cfg of defaults) {
      await this.prisma.sportsConfig.create({ data: cfg });
    }
  }
}
