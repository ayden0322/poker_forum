'use client';

// 排行榜（2026-07-09 定案）：獲利榜 / 勝率榜 雙榜，滿 30 場入榜
// - 獲利榜：期間淨獲利 P 幣排序（增加競爭感，週冠軍發限定稱號）
// - 勝率榜：勝率排序，平均賠率同列顯示（透明防「只押大熱門刷勝率」）
// - 僅前三名用琥珀（金=榮譽不是錢）；不引入紅綠漲跌色

import Link from 'next/link';
import { useState } from 'react';
import { LeaderboardType, usePredictionLeaderboard } from '@/lib/predictions';

const RANK_STYLE: Record<number, string> = {
  1: 'bg-accent-500 text-white',
  2: 'bg-accent-400/80 text-white',
  3: 'bg-accent-300/80 text-accent-900',
};

export default function Leaderboard() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [type, setType] = useState<LeaderboardType>('profit');
  const { data, isLoading } = usePredictionLeaderboard(period, type);
  const rows = data?.data.rows ?? [];
  const minSettled = data?.data.minSettled ?? 30;

  return (
    <div>
      {/* 榜別切換：獲利榜 / 勝率榜 */}
      <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 w-fit">
        {([['profit', '獲利榜'], ['winrate', '勝率榜']] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`px-4 py-1 rounded-md text-sm font-medium transition-colors ${
              type === t ? 'bg-[#39B8BE] text-white' : 'text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 期間切換 + 榜別說明 */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-2">
          {(['week', 'month'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-full text-sm ${
                period === p ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'
              }`}
            >
              {p === 'week' ? '本週' : '本月'}
            </button>
          ))}
        </div>
        <div className="text-xs text-gray-400">
          {type === 'profit' ? '比期間淨賺 P 幣' : '比獲勝機率'}
        </div>
      </div>

      {/* 入榜門檻說明 */}
      <div className="mt-2 text-xs text-gray-400">
        滿 {minSettled} 場已結算競猜才列入排名{type === 'winrate' ? '，平均賠率同列顯示' : ''}
      </div>

      <div className="mt-2 rounded-xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">載入中…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            本期還沒有人達 {minSettled} 場——累積競猜場次即可入榜
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
                  {type === 'profit'
                    ? `勝率 ${r.winRate}% · ${r.n} 場`
                    : `均賠 @${r.avgOdds} · ${r.n} 場`}
                </div>
              </div>
              <div className="text-right shrink-0">
                {type === 'profit' ? (
                  <div className={`font-mono-stadium tabular-nums font-bold ${r.profit >= 0 ? 'text-[#2a8d92]' : 'text-gray-500'}`}>
                    {r.profit >= 0 ? '+' : ''}{r.profit} P
                  </div>
                ) : (
                  <div className="font-mono-stadium tabular-nums font-bold text-gray-900">{r.winRate}%</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
