import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, ValidateIf } from 'class-validator';
import { EquipSlot } from '@betting-forum/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CosmeticsService } from './cosmetics.service';
import { isMemberEconomyEnabled } from '../economy/economy.flags';

class ShopQueryDto {
  @IsOptional() @IsIn(['FRAME', 'BADGE', 'TITLE', 'EFFECT']) type?: 'FRAME' | 'BADGE' | 'TITLE' | 'EFFECT';
}
class PurchaseDto {
  @IsString() itemId!: string;
}
class EquipDto {
  @IsIn(['FRAME', 'TITLE', 'EFFECT']) type!: 'FRAME' | 'TITLE' | 'EFFECT';
  @ValidateIf((o) => o.itemId !== null) @IsString() itemId!: string | null; // null = 卸下
}
class PinDto {
  @IsArray() @IsString({ each: true }) pinnedIds!: string[];
  @IsOptional() @IsString() mainBadgeId?: string;
}

/**
 * 會員端裝飾 API。fail-closed：總開關關閉時一律回 { enabled:false }，前端零渲染。
 */
@ApiTags('cosmetics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cosmetics')
export class CosmeticsController {
  constructor(private readonly cosmetics: CosmeticsService) {}

  @Get('shop')
  async shop(@CurrentUser() user: { id: string }, @Query() query: ShopQueryDto) {
    if (!isMemberEconomyEnabled()) return { data: { enabled: false, items: [] } };
    return { data: { enabled: true, ...(await this.cosmetics.getShop(user.id, query.type)) } };
  }

  @Get('inventory')
  async inventory(@CurrentUser() user: { id: string }) {
    if (!isMemberEconomyEnabled()) return { data: { enabled: false, items: [] } };
    return { data: { enabled: true, ...(await this.cosmetics.getInventory(user.id)) } };
  }

  @Post('purchase')
  async purchase(@CurrentUser() user: { id: string }, @Body() dto: PurchaseDto) {
    if (!isMemberEconomyEnabled()) return { data: { enabled: false } };
    return { data: { enabled: true, ...(await this.cosmetics.purchase(user.id, dto.itemId)) } };
  }

  @Post('equip')
  async equip(@CurrentUser() user: { id: string }, @Body() dto: EquipDto) {
    if (!isMemberEconomyEnabled()) return { data: { enabled: false } };
    return { data: { enabled: true, ...(await this.cosmetics.equip(user.id, dto.type as EquipSlot, dto.itemId ?? null)) } };
  }

  @Post('badges/pin')
  async pin(@CurrentUser() user: { id: string }, @Body() dto: PinDto) {
    if (!isMemberEconomyEnabled()) return { data: { enabled: false } };
    return { data: { enabled: true, ...(await this.cosmetics.pinBadges(user.id, dto.pinnedIds, dto.mainBadgeId ?? null)) } };
  }
}
