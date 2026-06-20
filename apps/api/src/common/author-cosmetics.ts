import { Prisma, Rarity } from '@betting-forum/database';
import { isMemberEconomyEnabled } from '../economy/economy.flags';

/**
 * 共用「作者已裝備裝飾」序列化。所有會帶出作者的端點都該用這支，確保：
 *  - 一致：到處都吐相同 { frame, title, mainBadge } 形狀
 *  - fail-closed：總開關關閉時一律回 null（公開頁也不洩裝飾）
 *
 * 用法：在 prisma user/author 的 select 裡展開 AUTHOR_COSMETIC_SELECT.cosmetics，
 * 取出後丟給 serializeAuthorCosmetics(user)。
 */
export const AUTHOR_COSMETIC_SELECT = {
  cosmetics: {
    where: { OR: [{ equippedSlot: { not: null } }, { isMainBadge: true }] },
    select: {
      equippedSlot: true,
      isMainBadge: true,
      item: { select: { type: true, name: true, iconKey: true, rarity: true } },
    },
  },
} satisfies Prisma.UserSelect;

interface CosmeticRow {
  equippedSlot: 'FRAME' | 'TITLE' | null;
  isMainBadge: boolean;
  item: { type: 'FRAME' | 'BADGE' | 'TITLE'; name: string; iconKey: string | null; rarity: Rarity };
}

export interface AuthorCosmetics {
  frame: { rarity: Rarity } | null;
  title: { name: string; rarity: Rarity } | null;
  mainBadge: { iconKey: string; rarity: Rarity } | null;
}

export function serializeAuthorCosmetics(
  user: { cosmetics?: CosmeticRow[] | null } | null | undefined,
): AuthorCosmetics | null {
  if (!isMemberEconomyEnabled()) return null; // fail-closed
  const cos = user?.cosmetics;
  if (!cos?.length) return null;
  const frame = cos.find((c) => c.equippedSlot === 'FRAME');
  const title = cos.find((c) => c.equippedSlot === 'TITLE');
  const badge = cos.find((c) => c.isMainBadge);
  return {
    frame: frame ? { rarity: frame.item.rarity } : null,
    title: title ? { name: title.item.name, rarity: title.item.rarity } : null,
    mainBadge: badge?.item.iconKey ? { iconKey: badge.item.iconKey, rarity: badge.item.rarity } : null,
  };
}
