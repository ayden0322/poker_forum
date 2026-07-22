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
import { IsBoolean, IsOptional, IsString, IsNumber, IsObject, IsArray, IsIn } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PageGuard } from '../common/guards/page.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@betting-forum/database';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../common/prisma.service';
import { ConfigService } from '@nestjs/config';
import { LEAGUE_CONFIG } from '../sports/sports.config';
import { OddsScanService } from '../predictions/odds-scan.service';
import { PredictionBoardsService } from '../predictions/prediction-boards.service';

class UpdateSportsConfigDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() apiHost?: string;
  @IsOptional() @IsNumber() leagueId?: number;
  @IsOptional() @IsString() season?: string;
  @IsOptional() @IsObject() cacheTtl?: Record<string, number>;
  @IsOptional() @IsObject() extraConfig?: Record<string, any>;
  // 競猜設定
  @IsOptional() @IsBoolean() predictionEnabled?: boolean;
  @IsOptional() @IsArray() @IsIn(['WINLOSE', 'OVER_UNDER'], { each: true }) predictionMarkets?: string[];
  @IsOptional() @IsNumber() bookmakerId?: number;
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
@UseGuards(JwtAuthGuard, RolesGuard, PageGuard)
@Roles(Role.MODERATOR) // floor；實際可見性由權限矩陣（預設僅超級管理員）控制
@Controller('admin/sports-config')
export class AdminSportsConfigController {
  private readonly logger = new Logger(AdminSportsConfigController.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private oddsScan: OddsScanService,
    private boards: PredictionBoardsService,
  ) {}

  @Get()
  @ApiOperation({ summary: '取得所有運動 API 設定' })
  async getAll(): Promise<{ data: unknown[] }> {
    await this.ensureDefaults();

    const configs = await this.prisma.sportsConfig.findMany({
      orderBy: [{ sportType: 'asc' }, { boardSlug: 'asc' }],
    });

    // 各板塊「未結算注單」筆數：讓管理者關閉板塊前知道還有多少單沒結完。
    // 結構上已解耦（關板塊仍會續跑結算），這裡純粹是知情用，避免誤以為關了就沒事。
    // 一次 groupBy 聚合，不做 N+1。
    const pendingRows = await this.prisma.$queryRaw<Array<{ board_slug: string; n: bigint }>>`
      SELECT m.board_slug, COUNT(*)::bigint AS n
      FROM bets b
      JOIN prediction_matches m ON m.id = b.match_id
      WHERE b.status = 'PENDING'
      GROUP BY m.board_slug
    `;
    const pendingMap = new Map(pendingRows.map((r) => [r.board_slug, Number(r.n)]));

    return { data: configs.map((c) => ({ ...c, pendingBets: pendingMap.get(c.boardSlug) ?? 0 })) };
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
        // 競猜設定（2026-07-20 由 prediction.config.ts 搬進後台）
        ...(dto.predictionEnabled !== undefined && { predictionEnabled: dto.predictionEnabled }),
        ...(dto.predictionMarkets !== undefined && { predictionMarkets: dto.predictionMarkets }),
        ...(dto.bookmakerId !== undefined && { bookmakerId: dto.bookmakerId }),
        updatedBy: user.id,
      },
    });

    // 讓板塊快取立刻失效，管理者存檔後不必等 60 秒
    this.boards.invalidate();
    if (dto.predictionEnabled !== undefined) {
      this.logger.warn(`管理員 ${user.id} 將 ${boardSlug} 競猜設為 ${dto.predictionEnabled ? '開啟' : '關閉'}`);
    }
    this.logger.log(`管理員 ${user.id} 更新了 ${boardSlug} 的設定`);
    return { data: updated };
  }

  @Post('scan-odds')
  @ApiOperation({ summary: '盤口可用性掃描：實測各聯賽現在有沒有賠率（開競猜前先看這個）' })
  async scanOdds(@Body() dto: { boardSlugs?: string[] }, @CurrentUser() user: { id: string }) {
    this.logger.log(`管理員 ${user.id} 觸發盤口掃描${dto?.boardSlugs?.length ? `（${dto.boardSlugs.join(',')}）` : '（全部）'}`);
    const rows = await this.oddsScan.scanAll(dto?.boardSlugs);
    return { data: rows };
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
