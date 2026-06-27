'use client';

import Link from 'next/link';
import { useMemberSummary } from '@/lib/member';

/**
 * Header 右上的會員徽章（G幣 + 等級），點擊進會員中心。
 * fail-closed：未登入或總開關關閉（enabled !== true）一律不顯示。
 */
export default function MemberBadges() {
  const { data } = useMemberSummary();
  const m = data?.data;
  if (!m?.enabled) return null;

  return (
    <Link href="/member-center" className="flex items-center gap-1.5" title="會員中心">
      <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-amber-900">
          G
        </span>
        {m.g ?? 0}
      </span>
      <span className="hidden rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white sm:inline">
        Lv.{m.level}
      </span>
    </Link>
  );
}
