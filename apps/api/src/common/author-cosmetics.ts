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
      expiresAt: true, // 到期稱號在序列化層濾除（fail-safe，不依賴卸下 cron）
      item: { select: { type: true, name: true, iconKey: true, assetUrl: true, rarity: true } },
    },
  },
} satisfies Prisma.UserSelect;

interface CosmeticRow {
  equippedSlot: 'FRAME' | 'TITLE' | 'EFFECT' | null;
  isMainBadge: boolean;
  expiresAt: Date | null;
  item: { type: 'FRAME' | 'BADGE' | 'TITLE' | 'EFFECT'; name: string; iconKey: string | null; assetUrl: string | null; rarity: Rarity };
}

export interface AuthorCosmetics {
  frame: { rarity: Rarity; assetUrl: string | null } | null;
  title: { name: string; rarity: Rarity } | null;
  mainBadge: { iconKey: string | null; assetUrl: string | null; rarity: Rarity } | null;
  effect: { assetUrl: string | null } | null; // 頭像特效(Lottie)，獨立槽
}

export function serializeAuthorCosmetics(
  user: { cosmetics?: CosmeticRow[] | null } | null | undefined,
): AuthorCosmetics | null {
  if (!isMemberEconomyEnabled()) return null; // fail-closed
  const now = Date.now();
  // 濾除已到期的裝飾（週冠軍臨時稱號到期即不顯示，不等卸下 cron）
  const cos = user?.cosmetics?.filter((c) => !c.expiresAt || c.expiresAt.getTime() > now);
  if (!cos?.length) return null;
  const frame = cos.find((c) => c.equippedSlot === 'FRAME');
  const title = cos.find((c) => c.equippedSlot === 'TITLE');
  const effect = cos.find((c) => c.equippedSlot === 'EFFECT');
  const badge = cos.find((c) => c.isMainBadge);
  return {
    frame: frame ? { rarity: frame.item.rarity, assetUrl: frame.item.assetUrl } : null,
    title: title ? { name: title.item.name, rarity: title.item.rarity } : null,
    mainBadge: badge && (badge.item.iconKey || badge.item.assetUrl)
      ? { iconKey: badge.item.iconKey, assetUrl: badge.item.assetUrl, rarity: badge.item.rarity }
      : null,
    effect: effect ? { assetUrl: effect.item.assetUrl } : null,
  };
}
