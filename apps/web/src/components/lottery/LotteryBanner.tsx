'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { LotteryBall } from './LotteryBall';

interface LotteryLatestItem {
  gameType: string;
  gameName: string;
  period: string;
  drawDate: string;
  numbers: number[];
  specialNum: number[] | null;
  jackpot: string | null;
  drawSchedule: string;
  noWinnerStreak: number;
}

interface LotteryLatestResponse {
  data: LotteryLatestItem[];
}

interface LotteryBannerProps {
  /** 只顯示指定的彩種，不傳則顯示全部 */
  gameTypes?: string[];
}

export function LotteryBanner({ gameTypes }: LotteryBannerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['lottery-latest'],
    queryFn: () => apiFetch<LotteryLatestResponse>('/lottery/latest'),
    staleTime: 5 * 60 * 1000, // 5 分鐘
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="mb-4 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100 p-4">
        <div className="flex items-center gap-2 text-blue-600 text-sm">
          <span className="animate-pulse">載入開獎資料中...</span>
        </div>
      </div>
    );
  }

  let items = data?.data ?? [];
  if (gameTypes && gameTypes.length > 0) {
    items = items.filter((item) => gameTypes.includes(item.gameType));
  }
  if (items.length === 0) return null;

  // 根據顯示數量調整 grid 列數
  const gridCols = items.length === 1
    ? 'grid-cols-1'
    : items.length === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : items.length === 3
        ? 'grid-cols-1 sm:grid-cols-3'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🎰</span>
        <h3 className="font-bold text-gray-800">最新開獎速報</h3>
      </div>
      <div className={`grid ${gridCols} gap-3`}>
        {items.map((item) => (
          <LotteryCard key={item.gameType} item={item} />
        ))}
      </div>
    </div>
  );
}

function LotteryCard({ item }: { item: LotteryLatestItem }) {
  const drawDate = new Date(item.drawDate).toLocaleDateString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
  });

  const jackpotStr = item.jackpot
    ? `NT$ ${Number(item.jackpot).toLocaleString()}`
    : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow">
      {/* 標題列 */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-sm text-gray-800">{item.gameName}</span>
        <span className="text-xs text-gray-400">{drawDate} 第{item.period.slice(-4)}期</span>
      </div>

      {/* 號碼球 */}
      <div className="flex flex-wrap gap-1 mb-2">
        {item.numbers.map((num, i) => (
          <LotteryBall key={i} number={num} size="sm" />
        ))}
        {item.specialNum?.map((num, i) => (
          <LotteryBall key={`s-${i}`} number={num} size="sm" isSpecial />
        ))}
      </div>

      {/* 頭獎獎金 */}
      {jackpotStr && (
        <div className="text-xs text-gray-500">
          💰 頭獎：<span className="text-red-500 font-semibold">{jackpotStr}</span>
        </div>
      )}

      {/* 連槓提示 — 只有大樂透/威力彩才有累積獎金概念 */}
      {item.noWinnerStreak > 0 && (
        <div className="text-xs text-orange-600 font-medium mt-1">
          🔥 已連續 {item.noWinnerStreak} 期無人中頭獎
        </div>
      )}

      {/* 開獎時間 */}
      <div className="text-xs text-gray-400 mt-1 pt-1 border-t border-gray-100">
        🕐 開獎時間：{item.drawSchedule}
      </div>
    </div>
  );
}
