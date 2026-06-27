'use client';

import type { MemberSummary } from '@/lib/member';

/**
 * 經驗進度條。依後端 getSummary 的三種狀態顯示：
 *  - 有下一級：顯示距下一級還需多少經驗
 *  - progressPct=100 且無下一級：已達經驗頂級（如 Lv4）
 *  - progressPct=null：邀請制（Lv5）或未知等級，不顯示比例
 */
export default function ExperienceBar({ m }: { m: MemberSummary }) {
  const pct = m.progressPct ?? 0;
  const exp = m.exp ?? 0;

  let hint: string;
  if (m.nextLevel) {
    const need = Math.max(0, m.nextLevel.minExp - exp);
    hint = `距 ${m.nextLevel.name} 還需 ${need} 經驗`;
  } else if (m.progressPct === 100) {
    hint = '已達經驗頂級';
  } else {
    hint = '邀請制等級';
  }

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-gray-500">
        <span>經驗 {exp}</span>
        <span>{hint}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-[#39B8BE] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
