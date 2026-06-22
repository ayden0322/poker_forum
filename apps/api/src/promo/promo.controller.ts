import { Controller, Post, Body, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { PromoService } from './promo.service';
import { TrackVisitDto } from './dto/promo.dto';
import { getClientIp } from '../common/get-client-ip.util';

/** 公開端點：推廣連結落地頁回報點擊（無需登入）。 */
@ApiTags('promo')
@Controller('promo')
export class PromoController {
  constructor(private readonly promo: PromoService) {}

  @Post('visit')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: '記錄推廣連結點擊（去重、無效碼靜默忽略）；回傳碼是否有效' })
  async trackVisit(@Body() dto: TrackVisitDto, @Req() req: Request): Promise<{ valid: boolean }> {
    const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
    const valid = await this.promo.trackVisit(dto.code, dto.visitorId, getClientIp(req), ua);
    return { valid };
  }
}
