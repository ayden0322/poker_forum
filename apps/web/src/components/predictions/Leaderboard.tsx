'use client';

// 排行榜（設計規格 §6/§7.5）：
// - 視覺主角 = 表現分（風險調整報酬）+ 三元組（勝率 · 平均賠率 · 注數）；金額降級為小字
// - 僅前三名用琥珀（金=榮譽不是錢）；不引入紅綠漲跌色

import Link from 'next/link';
import { useState } from 'react';
import { usePredictionLeaderboard } from '@/lib/predictions';

// 金=榮譽：鎖品牌 accent #d97706（與裝飾系統傳說金同語義域；不用 Tailwind 預設 amber 避免色票漂移）
const RANK_STYLE: Record<number, string> = {
  1: 'bg-accent-500 text-white',
  2: 'bg-accent-400/80 text-white',
  3: 'bg-accent-300/80 text-accent-900',
};

export default function Leaderboard() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const { data, isLoading } = usePredictionLeaderboard(period);
  const rows = data?.data.rows ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['week', 'month'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-full text-sm ${
                period === p ? 'bg-[#39B8BE] text-white' : 'bg-white border border-gray-200 text-gray-600'
              }`}
            >
              {p === 'week' ? '本週' : '本月'}
            </button>
          ))}
        </div>
        <div className="text-xs text-gray-400">表現分 = 打贏賠率的程度，不是猜中次數</div>
      </div>

      <div className="mt-3 rounded-xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">載入中…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            本期還沒有人上榜——結算滿 1,000 P 的競猜即可入榜
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.nickname} className="flex items-center gap-3 px-4 py-3">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  RANK_STYLE[r.rank] ?? 'bg-gray-100 text-gray-500'
                }`}
              >
                {r.rank}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/predictions/record/${encodeURIComponent(r.nickname)}`} className="text-sm font-medium text-gray-900 hover:text-[#2a8d92] truncate block">
                  {r.nickname}
                </Link>
                <div className="text-xs text-gray-400 font-mono-stadium tabular-nums">
                  勝率 {r.winRate}% · 均賠 @{r.avgOdds} · {r.n} 注
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-gray-400">表現分</div>
                <div className="font-mono-stadium tabular-nums font-bold text-gray-900">{r.score}</div>
                <div className={`text-xs font-mono-stadium tabular-nums ${r.profit >= 0 ? 'text-[#2a8d92]' : 'text-gray-400'}`}>
                  {r.profit >= 0 ? '+' : ''}{r.profit} P
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
