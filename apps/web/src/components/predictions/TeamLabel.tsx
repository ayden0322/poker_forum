'use client';

// 隊伍標示（共用）：隊徽/國旗 + 中文名；查不到映射 fallback 縮寫圓徽。
// 所有顯示隊名的地方（盤口卡/戰績頁/bet slip/進行中注單）一律用這個，不准裸吐英文。
// 隊徽來源優先序：MLB 官方 SVG → 手工對照表的 API-Sports id（KBO/NPB）→ 後端帶來的 logoUrl（足球等新板塊）→ 國旗 → 縮寫。

import { useState, type ReactNode } from 'react';
import { teamAbbr, teamMeta } from '@/lib/team-meta';

type Size = 'sm' | 'md' | 'lg';

/** 純文字版（不需要 icon 的場合，如通知/摘要行） */
export function teamZh(nameEn: string): string {
  return teamMeta(nameEn)?.nameZh ?? nameEn;
}

const ICON_CLS: Record<Size, string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-7 h-7 sm:w-8 sm:h-8',
};

export default function TeamLabel({
  nameEn,
  logoUrl,
  size = 'md',
  className = '',
}: {
  nameEn: string;
  /** API-Sports 隊徽 URL（後端組好）；沒有就走對照表或縮寫 */
  logoUrl?: string | null;
  size?: Size;
  className?: string;
}) {
  const meta = teamMeta(nameEn);
  const [broken, setBroken] = useState(false);
  const iconCls = `${ICON_CLS[size]} shrink-0`;

  const src = meta?.mlbId
    ? `https://www.mlbstatic.com/team-logos/${meta.mlbId}.svg`
    : meta?.apiSportsId
      ? `https://media.api-sports.io/baseball/teams/${meta.apiSportsId}.png`
      : (logoUrl ?? null);

  const nameCls =
    size === 'lg'
      ? 'min-w-0 whitespace-normal break-words text-sm font-semibold leading-5 text-gray-900 sm:text-base'
      : 'truncate';

  let icon: ReactNode;
  if (src && !broken) {
    icon = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className={`${iconCls} object-contain`} />
    );
  } else if (meta?.flag) {
    icon = <span className={`leading-none ${size === 'sm' ? 'text-sm' : 'text-base'}`}>{meta.flag}</span>;
  } else {
    icon = (
      <span
        className={`${iconCls} rounded-full bg-gray-100 text-gray-500 flex items-center justify-center ${
          size === 'lg' ? 'text-[10px]' : 'text-[9px]'
        }`}
      >
        {teamAbbr(nameEn)}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 min-w-0 align-middle ${className}`}>
      {icon}
      <span className={nameCls}>{meta?.nameZh ?? nameEn}</span>
    </span>
  );
}
