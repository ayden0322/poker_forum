'use client';

// 隊伍標示（共用）：國旗/隊徽 + 中文名；查不到映射 fallback 縮寫圓徽。
// 所有顯示隊名的地方（盤口卡/戰績頁/bet slip/進行中注單）一律用這個，不准裸吐英文。

import { teamAbbr, teamMeta } from '@/lib/team-meta';

export default function TeamLabel({ nameEn, size = 'md' }: { nameEn: string; size?: 'sm' | 'md' }) {
  const meta = teamMeta(nameEn);
  const iconCls = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 align-middle">
      {meta?.flag ? (
        <span className={`leading-none ${size === 'sm' ? 'text-sm' : 'text-base'}`}>{meta.flag}</span>
      ) : meta?.mlbId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://www.mlbstatic.com/team-logos/${meta.mlbId}.svg`} alt="" className={iconCls} />
      ) : (
        <span className={`${iconCls} rounded-full bg-gray-100 text-[9px] text-gray-500 flex items-center justify-center shrink-0`}>
          {teamAbbr(nameEn)}
        </span>
      )}
      <span className="truncate">{meta?.nameZh ?? nameEn}</span>
    </span>
  );
}

/** 純文字版（不需要 icon 的場合，如通知/摘要行） */
export function teamZh(nameEn: string): string {
  return teamMeta(nameEn)?.nameZh ?? nameEn;
}
