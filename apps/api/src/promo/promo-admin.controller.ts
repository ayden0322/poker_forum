import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PromoService } from './promo.service';
import {
  CreatePartnerDto,
  UpdatePartnerDto,
  CreateCodeDto,
  UpdateCodeDto,
  ReportQueryDto,
} from './dto/promo.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PageGuard } from '../common/guards/page.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@betting-forum/database';

/**
 * 後台推廣管理。路徑第一段 = promo → PageGuard 經 SEGMENT_TO_PAGE 對應 pageKey 'promo'，
 * 預設只開放 ADMIN 以上（見 page-registry）。
 */
@ApiTags('admin-promo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PageGuard)
@Roles(Role.MODERATOR) // floor；實際可見性由 PageGuard 讀矩陣決定
@Controller('admin/promo')
export class PromoAdminController {
  constructor(private readonly promo: PromoService) {}

  // ---- 廠商 ----
  @Get('partners')
  async listPartners() {
    return { data: await this.promo.listPartners() };
  }

  @Post('partners')
  async createPartner(@Body() dto: CreatePartnerDto, @CurrentUser('id') userId?: string) {
    return { data: await this.promo.createPartner(dto, userId) };
  }

  @Patch('partners/:id')
  async updatePartner(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return { data: await this.promo.updatePartner(id, dto) };
  }

  @Delete('partners/:id')
  async deletePartner(@Param('id') id: string) {
    return { data: await this.promo.deletePartner(id) };
  }

  // ---- 推廣碼 ----
  @Get('codes')
  async listCodes(@Query('partnerId') partnerId?: string) {
    return { data: await this.promo.listCodes(partnerId) };
  }

  @Post('codes')
  async createCode(@Body() dto: CreateCodeDto) {
    return { data: await this.promo.createCode(dto) };
  }

  @Patch('codes/:id')
  async updateCode(@Param('id') id: string, @Body() dto: UpdateCodeDto) {
    return { data: await this.promo.updateCode(id, dto) };
  }

  @Delete('codes/:id')
  async deleteCode(@Param('id') id: string) {
    return { data: await this.promo.deleteCode(id) };
  }

  // ---- 漏斗報表 ----
  @Get('report')
  @ApiOperation({ summary: '推廣漏斗報表（點擊/註冊/手機驗證 + 轉換率 + 趨勢）' })
  async report(@Query() q: ReportQueryDto) {
    return { data: await this.promo.report(q.from, q.to, q.partnerId) };
  }

  @Get('report.csv')
  @ApiOperation({ summary: '匯出結算用 CSV' })
  async reportCsv(@Query() q: ReportQueryDto, @Res() res: Response) {
    const csv = await this.promo.exportCsv(q.from, q.to, q.partnerId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="promo-report.csv"');
    res.send(csv);
  }
}
