import { BadRequestException, Injectable } from '@nestjs/common';
import { Currency, EquipSlot, LedgerReason, Prisma } from '@betting-forum/database';
import { PrismaService } from '../common/prisma.service';
import { EconomyService, InsufficientBalanceError } from '../economy/economy.service';

export type PurchaseResult =
  | { ok: true; balanceG: number }
  | { ok: false; reason: 'already_owned' };

const MAX_PINNED = 3;

/**
 * 會員端裝飾邏輯（商店/庫存/購買/裝備/釘選）。
 * 純虛擬：只 G幣兌換、永久擁有、無真錢。購買走 SHOP_PURCHASE。
 * 不在此檢查總開關——由 controller 統一 fail-closed（關閉時整個 API 回 enabled:false）。
 */
@Injectable()
export class CosmeticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
  ) {}

  /** 商店：上架販售中的品項（含 owned / affordable 標記） */
  async getShop(userId: string, type?: 'FRAME' | 'BADGE' | 'TITLE', now: Date = new Date()) {
    const items = await this.prisma.cosmeticItem.findMany({
      where: {
        enabled: true,
        purchasable: true,
        priceG: { not: null },
        ...(type ? { type } : {}),
        AND: [
          { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
          { OR: [{ availableTo: null }, { availableTo: { gte: now } }] },
        ],
      },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    });
    const [ownedRows, balanceG] = await Promise.all([
      this.prisma.userCosmetic.findMany({ where: { userId, itemId: { in: items.map((i) => i.id) } }, select: { itemId: true } }),
      this.economy.getBalance(userId, Currency.G),
    ]);
    const ownedSet = new Set(ownedRows.map((r) => r.itemId));
    return {
      balanceG,
      items: items.map((i) => ({
        id: i.id, type: i.type, name: i.name, description: i.description,
        iconKey: i.iconKey, rarity: i.rarity, priceG: i.priceG, levelRequired: i.levelRequired,
        owned: ownedSet.has(i.id),
        affordable: i.priceG != null && balanceG >= i.priceG,
      })),
    };
  }

  /** 我的庫存 + 裝備狀態 */
  async getInventory(userId: string) {
    const rows = await this.prisma.userCosmetic.findMany({
      where: { userId },
      include: { item: true },
      orderBy: [{ item: { type: 'asc' } }, { item: { sortOrder: 'asc' } }],
    });
    return {
      items: rows.map((r) => ({
        itemId: r.itemId, type: r.item.type, name: r.item.name, iconKey: r.item.iconKey,
        rarity: r.item.rarity, source: r.source,
        equippedSlot: r.equippedSlot, isMainBadge: r.isMainBadge, pinnedOrder: r.pinnedOrder,
      })),
    };
  }

  /**
   * 購買：原子化（扣 G幣 + 發貨同一交易，失敗整批 rollback，杜絕「付了款沒拿到」）。
   * 冪等鍵 + (userId,itemId) 唯一鍵 → 重送不重複扣、不重複擁有。
   */
  async purchase(userId: string, itemId: string): Promise<PurchaseResult> {
    const item = await this.prisma.cosmeticItem.findUnique({ where: { id: itemId } });
    if (!item || !item.enabled || !item.purchasable) throw new BadRequestException('此裝飾無法購買');
    if (item.priceG == null) throw new BadRequestException('此裝飾非販售品');
    const now = new Date();
    if (item.availableFrom && now < item.availableFrom) throw new BadRequestException('此裝飾尚未開賣');
    if (item.availableTo && now > item.availableTo) throw new BadRequestException('此裝飾已下架');
    if (item.levelRequired) {
      const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { level: true } });
      if (u.level < item.levelRequired) throw new BadRequestException(`需達 Lv.${item.levelRequired} 才能購買`);
    }
    // 已擁有 → 不扣款（冪等）
    const owned = await this.prisma.userCosmetic.findUnique({ where: { userId_itemId: { userId, itemId } } });
    if (owned) return { ok: false, reason: 'already_owned' };

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.economy.debitInTx(tx, {
          userId, currency: Currency.G, amount: item.priceG!,
          reason: LedgerReason.SHOP_PURCHASE, refType: 'shop', refId: itemId,
          idempotencyKey: `shop:${userId}:${itemId}`,
        });
        await tx.userCosmetic.create({ data: { userId, itemId, source: 'SHOP' } });
      });
    } catch (e) {
      if (e instanceof InsufficientBalanceError) throw new BadRequestException('G幣不足');
      // 並發重複購買：唯一鍵擋下 → 視為已擁有（交易已 rollback，未重複扣）
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { ok: false, reason: 'already_owned' };
      }
      throw e;
    }
    const balanceG = await this.economy.getBalance(userId, Currency.G);
    return { ok: true, balanceG };
  }

  /** 裝備 / 卸下 框或稱號（itemId=null 為卸下該槽） */
  async equip(userId: string, slot: EquipSlot, itemId: string | null) {
    if (itemId === null) {
      await this.prisma.userCosmetic.updateMany({ where: { userId, equippedSlot: slot }, data: { equippedSlot: null } });
      return { ok: true };
    }
    const uc = await this.prisma.userCosmetic.findUnique({
      where: { userId_itemId: { userId, itemId } }, include: { item: { select: { type: true } } },
    });
    if (!uc) throw new BadRequestException('未擁有此裝飾');
    if (uc.item.type !== slot) throw new BadRequestException('裝飾類型與槽位不符');
    // 先清同槽舊裝備，再設新（partial unique 保證每槽至多 1 件）
    await this.prisma.$transaction([
      this.prisma.userCosmetic.updateMany({ where: { userId, equippedSlot: slot }, data: { equippedSlot: null } }),
      this.prisma.userCosmetic.update({ where: { userId_itemId: { userId, itemId } }, data: { equippedSlot: slot } }),
    ]);
    return { ok: true };
  }

  /** 設定釘選勳章（≤3）與主勳章（須在釘選清單內、皆為己有的 BADGE） */
  async pinBadges(userId: string, pinnedIds: string[], mainBadgeId?: string | null) {
    const ids = [...new Set(pinnedIds)];
    if (ids.length > MAX_PINNED) throw new BadRequestException(`最多釘選 ${MAX_PINNED} 枚勳章`);
    if (mainBadgeId && !ids.includes(mainBadgeId)) throw new BadRequestException('主勳章必須在釘選清單內');

    if (ids.length) {
      const owned = await this.prisma.userCosmetic.findMany({
        where: { userId, itemId: { in: ids } }, include: { item: { select: { type: true } } },
      });
      if (owned.length !== ids.length) throw new BadRequestException('含未擁有的勳章');
      if (owned.some((o) => o.item.type !== 'BADGE')) throw new BadRequestException('只能釘選勳章');
    }

    await this.prisma.$transaction(async (tx) => {
      // 先清掉此使用者所有釘選/主勳章（pinnedOrder/isMainBadge 僅勳章會有）
      await tx.userCosmetic.updateMany({ where: { userId }, data: { pinnedOrder: null, isMainBadge: false } });
      for (let i = 0; i < ids.length; i++) {
        await tx.userCosmetic.update({
          where: { userId_itemId: { userId, itemId: ids[i] } },
          data: { pinnedOrder: i + 1, isMainBadge: ids[i] === mainBadgeId },
        });
      }
    });
    return { ok: true };
  }
}
