import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  BadRequestException,
  NotFoundException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@betting-forum/database';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TranslationService, TranslatableEntity, EntityType } from './translation.service';
import { PrismaService } from '../common/prisma.service';

/** 可疑翻譯偵測規則 */
function detectSuspicious(nameZhTw: string | null | undefined): string | null {
  if (!nameZhTw) return '缺少中文翻譯';

  // 含英文字母（混雜）
  if (/[a-zA-Z]/.test(nameZhTw)) return '中文含英文字母';

  // 太短
  if (nameZhTw.length < 2) return '中文太短';

  // 太長
  if (nameZhTw.length > 10) return '中文過長（>10 字）';

  // 含特殊符號（非中文標點）
  if (/[_\\\/\|\[\]{}()]/.test(nameZhTw)) return '含特殊符號';

  // 重複字元超過一半（如「洋洋洋基」）
  const charCount = new Map<string, number>();
  for (const c of nameZhTw) {
    charCount.set(c, (charCount.get(c) ?? 0) + 1);
  }
  const maxRepeat = Math.max(...charCount.values());
  if (maxRepeat >= 3 && maxRepeat / nameZhTw.length >= 0.5) return '字元重複過多';

  return null;
}

@ApiTags('admin:translations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/translations')
export class TranslationAdminController {
  constructor(
    private translation: TranslationService,
    private prisma: PrismaService,
  ) {}

  @Get('usage')
  @ApiOperation({ summary: '取得本月 Claude AI 使用量與花費' })
  async getUsage() {
    const data = await this.translation.getMonthlyCost();
    return { data };
  }

  @Get()
  @ApiOperation({ summary: '翻譯列表（支援搜尋、篩選、分頁）' })
  async list(
    @Query('entityType') entityType?: string,
    @Query('sport') sport?: string,
    @Query('verified') verified?: string,
    @Query('suspicious') suspicious?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize: number = 50,
  ): Promise<{ data: { items: any[]; total: number; page: number; pageSize: number; totalPages: number } }> {
    const where: any = {};

    if (entityType && entityType !== 'all') where.entityType = entityType;
    if (sport && sport !== 'all') where.sport = sport;
    if (verified === 'true') where.verified = true;
    if (verified === 'false') where.verified = false;

    if (search) {
      where.OR = [
        { nameEn: { contains: search, mode: 'insensitive' } },
        { nameZhTw: { contains: search, mode: 'insensitive' } },
        { shortName: { contains: search, mode: 'insensitive' } },
        { nickname: { contains: search, mode: 'insensitive' } },
      ];
    }

    // 若要看可疑，要先全部撈出來再過濾（suspicious 是計算出來的）
    const totalNoSusFilter = await this.prisma.translation.count({ where });

    let items;
    let total = totalNoSusFilter;

    if (suspicious === 'true') {
      // 全撈，過濾可疑的，再分頁
      const all = await this.prisma.translation.findMany({
        where,
        orderBy: [{ entityType: 'asc' }, { apiId: 'asc' }],
      });
      const suspicious_items = all
        .map((t) => ({ ...t, suspicious: detectSuspicious(t.nameZhTw) }))
        .filter((t) => t.suspicious);
      total = suspicious_items.length;
      items = suspicious_items.slice((page - 1) * pageSize, page * pageSize);
    } else {
      items = await this.prisma.translation.findMany({
        where,
        orderBy: [{ verified: 'asc' }, { entityType: 'asc' }, { apiId: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      items = items.map((t) => ({ ...t, suspicious: detectSuspicious(t.nameZhTw) }));
    }

    return {
      data: {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  @Get('stats')
  @ApiOperation({ summary: '翻譯品質儀表板統計' })
  async getStats() {
    const [byType, bySource, total, verifiedCount, all] = await Promise.all([
      this.prisma.translation.groupBy({ by: ['entityType'], _count: true }),
      this.prisma.translation.groupBy({ by: ['source'], _count: true }),
      this.prisma.translation.count(),
      this.prisma.translation.count({ where: { verified: true } }),
      this.prisma.translation.findMany({ select: { nameZhTw: true } }),
    ]);

    const suspiciousCount = all.filter((t) => detectSuspicious(t.nameZhTw)).length;

    return {
      data: {
        total,
        verified: verifiedCount,
        suspicious: suspiciousCount,
        byType: byType.map((b) => ({ type: b.entityType, count: b._count })),
        bySource: bySource.map((b) => ({ source: b.source, count: b._count })),
      },
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新翻譯（單筆）' })
  async update(
    @Param('id') id: string,
    @Body()
    dto: {
      nameZhTw?: string;
      shortName?: string | null;
      nickname?: string | null;
      verified?: boolean;
    },
  ): Promise<{ data: any }> {
    const existing = await this.prisma.translation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('找不到此翻譯');

    const updated = await this.prisma.translation.update({
      where: { id },
      data: {
        ...(dto.nameZhTw !== undefined && { nameZhTw: dto.nameZhTw }),
        ...(dto.shortName !== undefined && { shortName: dto.shortName || null }),
        ...(dto.nickname !== undefined && { nickname: dto.nickname || null }),
        ...(dto.verified !== undefined && { verified: dto.verified }),
        source: 'manual', // 手動編輯後標記為 manual
      },
    });

    return { data: updated };
  }

  @Post('bulk-verify')
  @ApiOperation({ summary: '批次標記為已校正' })
  async bulkVerify(@Body() dto: { ids: string[] }) {
    if (!dto.ids || dto.ids.length === 0) {
      throw new BadRequestException('ids 不能為空');
    }

    const result = await this.prisma.translation.updateMany({
      where: { id: { in: dto.ids } },
      data: { verified: true },
    });

    return { data: { updated: result.count } };
  }

  @Delete(':id')
  @ApiOperation({ summary: '刪除翻譯（下次 Cron 會重新翻譯）' })
  async remove(@Param('id') id: string) {
    await this.prisma.translation.delete({ where: { id } });
    return { data: { deleted: true } };
  }

  @Post(':id/retranslate')
  @ApiOperation({ summary: '單筆重新呼叫 Claude 翻譯' })
  async retranslate(@Param('id') id: string): Promise<{ data: { updated: any; translated: number } }> {
    const existing = await this.prisma.translation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('找不到此翻譯');

    // 先刪除，再送去翻譯
    await this.prisma.translation.delete({ where: { id } });

    const entity: TranslatableEntity = {
      entityType: existing.entityType as EntityType,
      apiId: existing.apiId,
      nameEn: existing.nameEn,
      sport: existing.sport,
      logo: existing.logo ?? undefined,
      extra: existing.extra as Record<string, unknown> | undefined,
    };

    const count = await this.translation.translateBatch([entity], { triggeredBy: 'manual' });

    // 重新查回來
    const updated = await this.prisma.translation.findFirst({
      where: {
        entityType: existing.entityType,
        apiId: existing.apiId,
        sport: existing.sport,
      },
    });

    return { data: { updated, translated: count } };
  }

  @Get('export/csv')
  @ApiOperation({ summary: '匯出翻譯為 CSV' })
  async exportCsv(
    @Res() res: Response,
    @Query('entityType') entityType?: string,
    @Query('sport') sport?: string,
  ) {
    const where: any = {};
    if (entityType && entityType !== 'all') where.entityType = entityType;
    if (sport && sport !== 'all') where.sport = sport;

    const items = await this.prisma.translation.findMany({
      where,
      orderBy: [{ entityType: 'asc' }, { apiId: 'asc' }],
    });

    const escape = (s: string | null | undefined) => {
      if (s === null || s === undefined) return '';
      const str = String(s);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = ['id,entityType,apiId,sport,nameEn,nameZhTw,shortName,nickname,verified,source'];
    for (const t of items) {
      lines.push(
        [
          t.id,
          t.entityType,
          t.apiId,
          t.sport,
          escape(t.nameEn),
          escape(t.nameZhTw),
          escape(t.shortName),
          escape(t.nickname),
          t.verified,
          t.source,
        ].join(','),
      );
    }

    const csv = '\uFEFF' + lines.join('\n'); // BOM 給 Excel 用 UTF-8 讀
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="translations-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }

  @Post('import/csv')
  @ApiOperation({ summary: 'CSV 批次匯入翻譯更新' })
  async importCsv(@Body() dto: { csv: string }) {
    if (!dto.csv) throw new BadRequestException('csv 不能為空');

    // 移除 BOM
    const content = dto.csv.replace(/^\uFEFF/, '');
    const lines = content.split('\n').filter((l) => l.trim());
    if (lines.length < 2) throw new BadRequestException('CSV 格式錯誤');

    // 簡易 CSV 解析（支援引號包圍）
    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQuote && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuote = !inQuote;
          }
        } else if (c === ',' && !inQuote) {
          result.push(current);
          current = '';
        } else {
          current += c;
        }
      }
      result.push(current);
      return result;
    };

    const header = parseCsvLine(lines[0]);
    const idxId = header.indexOf('id');
    const idxZh = header.indexOf('nameZhTw');
    const idxShort = header.indexOf('shortName');
    const idxNick = header.indexOf('nickname');
    const idxVerified = header.indexOf('verified');

    if (idxId < 0 || idxZh < 0) {
      throw new BadRequestException('CSV 必須包含 id 與 nameZhTw 欄位');
    }

    let updated = 0;
    let errors = 0;
    for (let i = 1; i < lines.length; i++) {
      try {
        const cols = parseCsvLine(lines[i]);
        const id = cols[idxId];
        if (!id) continue;

        await this.prisma.translation.update({
          where: { id },
          data: {
            nameZhTw: cols[idxZh],
            ...(idxShort >= 0 && { shortName: cols[idxShort] || null }),
            ...(idxNick >= 0 && { nickname: cols[idxNick] || null }),
            ...(idxVerified >= 0 && {
              verified: cols[idxVerified]?.toLowerCase() === 'true',
            }),
            source: 'manual',
          },
        });
        updated++;
      } catch {
        errors++;
      }
    }

    return { data: { updated, errors } };
  }
}
