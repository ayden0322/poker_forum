'use client';

// 公開戰績頁（設計規格 §8）
// 主角是「立場與命中」：卡面 = 賽事、選邊、鎖定賠率、命中與否——不顯示投注額與獲利（曬的是預測不是錢）。
// 不預留任何付費版位（三期榮譽版定案）。

import Link from 'next/link';
import { BET_STATUS_VIEW, SELECTION_LABEL, twTime, usePublicRecord } from '@/lib/predictions';

export default function RecordClient({ nickname }: { nickname: string }) {
  const { data, isLoading } = usePublicRecord(nickname);
  const rec = data?.data;

  if (isLoading) return <div className="text-center text-sm text-gray-400 py-16">載入中…</div>;
  if (!rec?.enabled) return null; // fail-closed：功能未開放不露任何內容
  if (!rec.found) {
    return <div className="text-center text-sm text-gray-400 py-16">找不到這位會員</div>;
  }

  const stats = rec.stats!;
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-sm text-gray-400">
        <Link href="/predictions" className="hover:text-[#2a8d92]">賽事競猜</Link> / 戰績
      </div>
      <h1 className="mt-1 text-xl font-bold text-gray-900">{rec.nickname} 的競猜戰績</h1>

      {/* 三元組（透明本身是防禦：勝率永遠跟平均賠率、注數一起出現） */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { label: '勝率', value: stats.n > 0 ? `${stats.winRate}%` : '—' },
          { label: '平均賠率', value: stats.n > 0 ? `@${stats.avgOdds}` : '—' },
          { label: '有效注數', value: stats.n },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-100 bg-white p-4 text-center shadow-sm">
            <div className="text-xs text-gray-400">{s.label}</div>
            <div className="mt-1 text-xl font-bold font-mono-stadium tabular-nums text-gray-900">{s.value}</div>
          </div>
        ))}
      </div>

      {/* 近期競猜 */}
      <h2 className="mt-6 text-base font-bold text-gray-900">近期競猜</h2>
      <div className="mt-2 space-y-2">
        {(rec.recent ?? []).length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
            還沒有已結算的競猜
          </div>
        ) : (
          rec.recent!.map((b, i) => {
            const sv = BET_STATUS_VIEW[b.status];
            const sel = b.market === 'OVER_UNDER' ? `${SELECTION_LABEL[b.selection]} ${b.line}` : SELECTION_LABEL[b.selection];
            return (
              <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{b.home} vs {b.away}</div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {sel} <span className="font-mono-stadium tabular-nums">@{b.lockedOdds}</span> · {twTime(b.startTime)}
                  </div>
                </div>
                <span className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${sv.className}`}>{sv.label}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
