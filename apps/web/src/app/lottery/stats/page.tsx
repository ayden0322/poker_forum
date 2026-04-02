'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { LotteryBall } from '@/components/lottery/LotteryBall';

const GAME_OPTIONS = [
  { value: 'LOTTO649', label: '大樂透', maxNum: 49 },
  { value: 'SUPER_LOTTO', label: '威力彩', maxNum: 38 },
  { value: 'DAILY539', label: '今彩539', maxNum: 39 },
  { value: 'LOTTO1224', label: '雙贏彩', maxNum: 24 },
  { value: 'LOTTO3D', label: '3星彩', maxNum: 9 },
  { value: 'LOTTO4D', label: '4星彩', maxNum: 9 },
];

const RANGE_OPTIONS = [30, 50, 100];

interface StatsData {
  totalDraws: number;
  frequency: { number: number; count: number }[];
  hot: { number: number; count: number }[];
  cold: { number: number; count: number }[];
  tailStats: { tail: number; count: number }[];
}

interface StatsResponse {
  data: StatsData;
}

export default function LotteryStatsPage() {
  const [gameType, setGameType] = useState('LOTTO649');
  const [range, setRange] = useState(100);

  const { data, isLoading } = useQuery({
    queryKey: ['lottery-stats', gameType, range],
    queryFn: () =>
      apiFetch<StatsResponse>(`/lottery/stats?gameType=${gameType}&range=${range}`),
  });

  const stats = data?.data;
  const maxFreq = stats ? Math.max(...stats.frequency.map((f) => f.count)) : 1;
  const maxTail = stats ? Math.max(...stats.tailStats.map((t) => t.count)) : 1;

  return (
    <div className="max-w-4xl mx-auto">
      {/* 麵包屑 */}
      <nav className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link href="/" className="hover:text-blue-600">首頁</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">號碼統計分析</span>
      </nav>

      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        📊 號碼統計分析
      </h1>

      {/* 篩選器 */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">彩種：</label>
          <select
            value={gameType}
            onChange={(e) => setGameType(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {GAME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">分析範圍：</label>
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  range === r
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                近 {r} 期
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-12 text-gray-500">載入統計資料中...</div>
      )}

      {stats && stats.totalDraws > 0 && (
        <div className="space-y-6">
          <p className="text-sm text-gray-500">
            共分析 {stats.totalDraws} 期開獎結果
          </p>

          {/* 熱門號碼 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-lg mb-3 text-red-600">🔥 熱門號碼（出現最多）</h2>
            <div className="flex flex-wrap gap-3">
              {stats.hot.map((item) => (
                <div key={item.number} className="flex flex-col items-center gap-1">
                  <LotteryBall number={item.number} size="lg" />
                  <span className="text-xs text-gray-500 font-medium">{item.count} 次</span>
                </div>
              ))}
            </div>
          </div>

          {/* 冷門號碼 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-lg mb-3 text-blue-600">❄️ 冷門號碼（出現最少）</h2>
            <div className="flex flex-wrap gap-3">
              {stats.cold.map((item) => (
                <div key={item.number} className="flex flex-col items-center gap-1">
                  <LotteryBall number={item.number} size="lg" />
                  <span className="text-xs text-gray-500 font-medium">{item.count} 次</span>
                </div>
              ))}
            </div>
          </div>

          {/* 號碼頻率表 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-lg mb-4">📋 號碼出現頻率</h2>
            <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-2">
              {stats.frequency.map((item) => (
                <div key={item.number} className="flex flex-col items-center gap-1">
                  <LotteryBall number={item.number} size="sm" />
                  <div className="w-full bg-gray-100 rounded-full h-16 flex flex-col-reverse overflow-hidden">
                    <div
                      className="bg-blue-400 rounded-full transition-all duration-300"
                      style={{ height: `${(item.count / maxFreq) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 尾數分布 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-lg mb-4">🔢 尾數分布</h2>
            <div className="flex items-end gap-3 h-40">
              {stats.tailStats.map((item) => (
                <div key={item.tail} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-600 font-medium">{item.count}</span>
                  <div className="w-full bg-gray-100 rounded-t h-28 flex flex-col-reverse overflow-hidden">
                    <div
                      className="bg-green-400 transition-all duration-300"
                      style={{ height: `${(item.count / maxTail) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-700">{item.tail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {stats && stats.totalDraws === 0 && (
        <div className="text-center py-12 text-gray-500">
          尚無開獎資料，請先同步資料後再查看統計
        </div>
      )}
    </div>
  );
}
