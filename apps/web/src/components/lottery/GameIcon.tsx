'use client';

/**
 * 彩種 Icon — 自動 fallback 到 emoji
 */

import { LotteryMeta } from './lottery-meta';

interface Props {
  meta?: Pick<LotteryMeta, 'icon' | 'emoji'>;
  emoji?: string;
  size?: number;
  className?: string;
}

export function GameIcon({ meta, emoji, size = 24, className = '' }: Props) {
  const src = meta?.icon;
  const fallbackEmoji = meta?.emoji ?? emoji ?? '🎰';

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    );
  }
  return (
    <span className={className} style={{ fontSize: size }}>
      {fallbackEmoji}
    </span>
  );
}
