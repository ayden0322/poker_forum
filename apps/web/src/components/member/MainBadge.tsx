'use client';

import BadgeIcon from './BadgeIcon';
import type { Rarity } from '@/lib/cosmetics';

/** 主勳章顯示：圖檔(assetUrl)優先，否則 lucide(iconKey)。給作者列/Header 內聯用。 */
export default function MainBadge({
  badge, size = 20,
}: {
  badge: { iconKey: string | null; assetUrl: string | null; rarity: Rarity };
  size?: number;
}) {
  if (badge.assetUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={badge.assetUrl} alt="" width={size} height={size} style={{ objectFit: 'contain' }} />;
  }
  if (badge.iconKey) return <BadgeIcon iconKey={badge.iconKey} rarity={badge.rarity} size={size} />;
  return null;
}
