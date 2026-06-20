'use client';

import { icons } from 'lucide-react';
import { BADGE_TOKEN, type Rarity } from '@/lib/cosmetics';

function pascal(kebab: string): string {
  return kebab.split('-').map((s) => (s ? s[0].toUpperCase() + s.slice(1) : '')).join('');
}

/**
 * 勳章：圓形容器 + 單色線性 lucide icon，依稀有度上色。
 * locked=true → 灰階剪影（個人頁勳章牆的未獲得款）。
 * size = 容器直徑（列表內聯 20、個人頁牆 40）。
 */
export default function BadgeIcon({
  iconKey, rarity, size = 20, locked = false, title,
}: {
  iconKey: string;
  rarity: Rarity;
  size?: number;
  locked?: boolean;
  title?: string;
}) {
  const Icon = (icons as Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>>)[pascal(iconKey)]
    ?? icons.Award;
  const t = BADGE_TOKEN[rarity];
  const iconSize = Math.round(size * 0.62);
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '9999px',
        border: `1px solid ${locked ? '#E5E7EB' : t.border}`,
        background: locked ? 'transparent' : t.bg,
        filter: locked ? 'grayscale(1)' : undefined,
        opacity: locked ? 0.4 : 1,
        flexShrink: 0,
      }}
    >
      <Icon size={iconSize} strokeWidth={1.75} color={locked ? '#9CA3AF' : t.stroke} />
    </span>
  );
}
