'use client';

import { FRAME_RING, type Rarity } from '@/lib/cosmetics';

/**
 * 頭像 + 稀有度框（依 brand-preferences 2026-06-21 浮誇度修訂）：
 *  - 普通：靜態細灰環
 *  - 稀有：青綠環 + 雙層 box-shadow 做厚度（靜態）
 *  - 傳說：conic 金屬金漸層環（2px padding）；context='profile' 時加慢旋轉光圈，
 *    列表內聯(context='list', 預設)一律靜止（守資訊密度鐵律 + prefers-reduced-motion 關閉）
 */
export default function AvatarWithFrame({
  avatar, nickname, size = 32, frame, context = 'list',
}: {
  avatar: string | null;
  nickname: string;
  size?: number;
  frame?: { rarity: Rarity } | null;
  context?: 'list' | 'profile';
}) {
  const rarity = frame?.rarity;
  const isLegendary = rarity === 'LEGENDARY';
  const animate = isLegendary && context === 'profile';

  const inner = avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatar} width={size} height={size} alt={nickname} style={{ borderRadius: '9999px', display: 'block', objectFit: 'cover' }} />
  ) : (
    <span style={{
      width: size, height: size, borderRadius: '9999px', display: 'flex',
      alignItems: 'center', justifyContent: 'center', background: '#60a5fa',
      color: '#fff', fontWeight: 700, fontSize: size * 0.45,
    }}>
      {nickname.charAt(0)}
    </span>
  );

  // 傳說：conic 金漸層環（外層漸層 + 2px padding + 內層白描邊把頭像與金環分開）
  if (isLegendary) {
    return (
      <span
        className={animate ? 'cosmetic-frame-legendary-spin' : undefined}
        style={{
          display: 'inline-block', borderRadius: '9999px', padding: 2, lineHeight: 0,
          background: 'conic-gradient(from 0deg, #d97706, #fbbf24, #b45309, #fbbf24, #d97706)',
        }}
      >
        <span style={{ display: 'inline-block', borderRadius: '9999px', padding: 1.5, background: '#fff', lineHeight: 0 }}>
          {inner}
        </span>
      </span>
    );
  }

  const ring = frame ? FRAME_RING[frame.rarity] : undefined;
  return (
    <span
      style={{
        display: 'inline-block', borderRadius: '9999px', lineHeight: 0,
        padding: frame ? 2 : 0, ...(ring ?? {}),
      }}
    >
      {inner}
    </span>
  );
}
