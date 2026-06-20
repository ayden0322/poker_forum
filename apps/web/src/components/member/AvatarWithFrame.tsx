'use client';

import { FRAME_RING, type Rarity } from '@/lib/cosmetics';

/**
 * 頭像 + 稀有度描邊環（CSS，非圖片）。框與頭像間留 2px gap、無動畫（依品牌規範）。
 * frame=null 時就是純頭像，不顯示環。
 */
export default function AvatarWithFrame({
  avatar, nickname, size = 32, frame,
}: {
  avatar: string | null;
  nickname: string;
  size?: number;
  frame?: { rarity: Rarity } | null;
}) {
  const ring = frame ? FRAME_RING[frame.rarity] : undefined;
  return (
    <span
      style={{
        display: 'inline-block', borderRadius: '9999px', lineHeight: 0,
        padding: frame ? 2 : 0, ...(ring ?? {}),
      }}
    >
      {avatar ? (
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
      )}
    </span>
  );
}
