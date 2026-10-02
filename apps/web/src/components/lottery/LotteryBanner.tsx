'use client';

/**
 * LotteryBanner — 各看板用的「最新開獎速報」widget
 *
 * - 單一彩種看板（大樂透、威力彩、今彩539）→ 號碼走勢盤 LotteryNumberBoard
 * - 多彩種看板（3星彩 / 4星彩）→ 緊湊卡片 grid
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { LotteryBall } from './LotteryBall';
import { GameIcon } from './GameIcon';
import { LotteryNumberBoard } from './LotteryNumberBoard';
import { formatDrawDate, getMetaByType } from './lottery-meta';

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
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="mb-4 rounded-xl bg-gradient-to-r from-blue-50 to-amber-50 border border-blue-100 p-4">
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

  // 單一彩券 → 號碼走勢盤（含頭獎、倒數）
  const singleMeta = items.length === 1 ? getMetaByType(items[0].gameType) : undefined;
  if (singleMeta) {
    return (
      <div className="mb-4">
        <LotteryNumberBoard item={items[0]} meta={singleMeta} />
      </div>
    );
  }

  // 多彩券 → 緊湊卡片 grid
  const gridCols =
    items.length === 2
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
          <LotteryCardCompact key={item.gameType} item={item} />
        ))}
      </div>
    </div>
  );
}

// ===== 緊湊卡片（多彩券時用） =====
function LotteryCardCompact({ item }: { item: LotteryLatestItem }) {
  const meta = getMetaByType(item.gameType);
  const jackpot = item.jackpot ? Number(item.jackpot) : null;
  const isHot = item.noWinnerStreak >= 3;
  const drawDate = formatDrawDate(item.drawDate);

  return (
    <div className={`rounded-lg border bg-white p-3 shadow-sm hover:shadow-md transition-shadow ${isHot ? 'border-red-200' : 'border-gray-200'}`}>
      {/* 標題列 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {meta && <GameIcon meta={meta} size={20} />}
          <span className="font-bold text-sm text-gray-800">{item.gameName}</span>
        </div>
        <span className="text-xs text-gray-400">{drawDate} 第 {Number(item.period.slice(-4))} 期</span>
      </div>
      {/* 號碼球 */}
      <div className="flex flex-wrap gap-1 mb-2">
        {item.numbers.map((n) => (
          <LotteryBall key={n} number={n} size="sm" />
        ))}
        {item.specialNum?.map((n) => (
          <LotteryBall key={`s-${n}`} number={n} size="sm" isSpecial />
        ))}
      </div>
      {/* 頭獎累積 */}
      {jackpot && (
        <div className={`text-xs ${isHot ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
          💰 累積：
          <span className="tabular-nums">
            {jackpot >= 100_000_000 ? `${(jackpot / 100_000_000).toFixed(2)} 億` : `${(jackpot / 10_000).toFixed(0)} 萬`}
          </span>
        </div>
      )}
      {item.noWinnerStreak > 0 && (
        <div className="text-xs text-orange-600 font-medium mt-1">
          🔥 已連續 {item.noWinnerStreak} 期無人中頭獎
        </div>
      )}
      <div className="text-xs text-gray-400 mt-1 pt-1 border-t border-gray-100">🕐 {meta?.schedule ?? item.drawSchedule}</div>
    </div>
  );
}
