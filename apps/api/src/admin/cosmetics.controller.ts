import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException,
  Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';
import { CosmeticType, Rarity, Role } from '@betting-forum/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PageGuard } from '../common/guards/page.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../common/prisma.service';

class CreateCosmeticDto {
  @IsEnum(CosmeticType) type!: CosmeticType;
  @IsString() @MaxLength(40) name!: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @IsString() @MaxLength(60) iconKey?: string; // 勳章 lucide 名稱（kebab-case）；框/稱號留空
  @IsOptional() @IsEnum(Rarity) rarity?: Rarity;
  @IsOptional() @IsInt() @Min(0) priceG?: number; // 省略=非販售
  @IsOptional() @IsBoolean() purchasable?: boolean;
  @IsOptional() @IsInt() @Min(1) levelRequired?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() availableFrom?: string; // ISO 字串
  @IsOptional() @IsString() availableTo?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

// 更新：全部選填（PATCH 部分更新）
class UpdateCosmeticDto {
  @IsOptional() @IsString() @MaxLength(40) name?: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @IsString() @MaxLength(60) iconKey?: string;
  @IsOptional() @IsEnum(Rarity) rarity?: Rarity;
  @IsOptional() @IsInt() @Min(0) priceG?: number;
  @IsOptional() @IsBoolean() purchasable?: boolean;
  @IsOptional() @IsInt() @Min(1) levelRequired?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() availableFrom?: string;
  @IsOptional() @IsString() availableTo?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

/**
 * 裝飾商店後台 CRUD。
 * 語意（呼應 Codex 對審 #4/#10）：
 *  - 停售：priceG/purchasable/availableTo → 不再販售，但「已擁有者照常使用/顯示」（永久擁有）
 *  - 撤除：enabled=false → 全站隱藏，且**連帶把所有人對此品項的裝備/釘選清掉**（罕用 moderation）
 *  - 硬刪：僅限「無人擁有」時，否則擋下、要求改用停售/撤除
 * 顏色一律由 rarity 決定，不存自由填色（無 styleColor 欄位）。
 */
@ApiTags('admin:cosmetics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PageGuard)
@Roles(Role.MODERATOR) // floor；實際可見性由權限矩陣（預設 admin 以上）控制
@Controller('admin/cosmetics')
export class AdminCosmeticsController {
  constructor(private readonly prisma: PrismaService) {}

  /** 列出全部品項（含停售/撤除），供後台管理 */
  @Get()
  async list() {
    const data = await this.prisma.cosmeticItem.findMany({
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return { data };
  }

  @Post()
  async create(@Body() dto: CreateCosmeticDto) {
    this.assertIcon(dto.type, dto.iconKey);
    const item = await this.prisma.cosmeticItem.create({
      data: {
        type: dto.type,
        name: dto.name,
        description: dto.description ?? null,
        iconKey: dto.iconKey ?? null,
        rarity: dto.rarity ?? Rarity.COMMON,
        priceG: dto.priceG ?? null,
        purchasable: dto.purchasable ?? true,
        levelRequired: dto.levelRequired ?? null,
        enabled: dto.enabled ?? true,
        availableFrom: this.parseDate(dto.availableFrom),
        availableTo: this.parseDate(dto.availableTo),
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    return { data: item };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCosmeticDto) {
    const existing = await this.prisma.cosmeticItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('裝飾品項不存在');

    // 勳章不可被 PATCH 清空 iconKey
    if (dto.iconKey !== undefined && !dto.iconKey && existing.type === CosmeticType.BADGE) {
      throw new BadRequestException('勳章需要 lucide 圖示，不可清空');
    }

    const data = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.iconKey !== undefined ? { iconKey: dto.iconKey } : {}),
      ...(dto.rarity !== undefined ? { rarity: dto.rarity } : {}),
      ...(dto.priceG !== undefined ? { priceG: dto.priceG } : {}),
      ...(dto.purchasable !== undefined ? { purchasable: dto.purchasable } : {}),
      ...(dto.levelRequired !== undefined ? { levelRequired: dto.levelRequired } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      ...(dto.availableFrom !== undefined ? { availableFrom: this.parseDate(dto.availableFrom) } : {}),
      ...(dto.availableTo !== undefined ? { availableTo: this.parseDate(dto.availableTo) } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    };

    // 撤除（enabled 由 true→false）：交易內同時清掉所有人對此品項的裝備/釘選狀態
    const isRemoving = dto.enabled === false && existing.enabled === true;
    if (isRemoving) {
      const [item] = await this.prisma.$transaction([
        this.prisma.cosmeticItem.update({ where: { id }, data }),
        this.prisma.userCosmetic.updateMany({
          where: { itemId: id },
          data: { equippedSlot: null, isMainBadge: false, pinnedOrder: null },
        }),
      ]);
      return { data: item };
    }

    const item = await this.prisma.cosmeticItem.update({ where: { id }, data });
    return { data: item };
  }

  /** 硬刪：僅限無人擁有；否則擋下，請改用停售(purchasable=false)或撤除(enabled=false) */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const owners = await this.prisma.userCosmetic.count({ where: { itemId: id } });
    if (owners > 0) {
      throw new BadRequestException(
        `已有 ${owners} 位會員擁有此裝飾，不可硬刪。請改用停售(purchasable=false)或撤除(enabled=false)。`,
      );
    }
    await this.prisma.cosmeticItem.delete({ where: { id } });
    return { data: { ok: true } };
  }

  /** 勳章需要 lucide iconKey；頭像框/稱號視覺由 rarity 決定，不需 icon（Route A） */
  private assertIcon(type: CosmeticType, iconKey?: string) {
    if (type === CosmeticType.BADGE && !iconKey) {
      throw new BadRequestException('勳章需要指定 lucide 圖示（iconKey）');
    }
  }

  /** 解析日期字串；空→null；無效→400（避免 Invalid Date 入庫，Codex Phase1 #2） */
  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('日期格式不正確');
    return d;
  }
}
