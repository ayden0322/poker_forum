'use client';

/**
 * LotteryBanner — 各看板用的「最新開獎速報」widget
 *
 * 升級內容（v2）：
 * - 累積金額紅金漸層、放大字級
 * - 連續未中期數紅徽章 + 脈衝
 * - 開獎倒數
 * - 看板 icon 用插畫（GameIcon），fallback emoji
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { LotteryBall } from './LotteryBall';
import { GameIcon } from './GameIcon';
import { DrawCountdown } from './DrawCountdown';
import { getMetaByType, nextDrawTime } from './lottery-meta';

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

  const isSingle = items.length === 1;

  // 單一彩券 → 顯示完整大卡（含倒數 + 累積金額放大）
  if (isSingle) {
    return (
      <div className="mb-4">
        <LotteryHeroCard item={items[0]} />
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

// ===== Hero 大卡（單一彩券時用） =====
function LotteryHeroCard({ item }: { item: LotteryLatestItem }) {
  const meta = getMetaByType(item.gameType);
  const jackpot = item.jackpot ? Number(item.jackpot) : null;
  const isHot = item.noWinnerStreak >= 3;
  const nextDraw = meta ? nextDrawTime(meta).toISOString() : null;

  return (
    <div className="rounded-2xl overflow-hidden border-2 border-amber-300 shadow-md">
      <div className="grid md:grid-cols-[1.4fr_1fr] gap-0">
        {/* 左：累積金額 */}
        <div className="bg-gradient-to-br from-red-600 via-red-500 to-amber-500 text-white p-5 relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 text-[140px] opacity-10 leading-none pointer-events-none">💰</div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {meta && <GameIcon meta={meta} size={32} />}
              <span className="font-bold text-base">{item.gameName}</span>
              {isHot && (
                <span className="flex items-center gap-1 text-[10px] font-bold bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full tracking-wider">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  連 {item.noWinnerStreak} 期未中
                </span>
              )}
            </div>
            <div className="text-[10px] text-amber-100/90 tracking-widest mb-1">本期累積頭獎</div>
            {jackpot ? (
              <div className="font-bold tabular-nums leading-none my-1.5">
                {jackpot >= 100_000_000 ? (
                  <>
                    <span className="text-4xl md:text-5xl">{(jackpot / 100_000_000).toFixed(2)}</span>
                    <span className="text-lg ml-2 opacity-90">億</span>
                  </>
                ) : (
                  <>
                    <span className="text-4xl md:text-5xl">{(jackpot / 10_000).toFixed(0)}</span>
                    <span className="text-lg ml-2 opacity-90">萬</span>
                  </>
                )}
              </div>
            ) : (
              <div className="text-2xl opacity-80 my-1.5">—</div>
            )}
            {jackpot && <div className="text-[10px] text-amber-50/80 mb-2">NT$ {jackpot.toLocaleString()}</div>}
            {/* 上期號碼球 */}
            <div className="mt-3 pt-3 border-t border-white/20">
              <div className="text-[10px] text-amber-100/80 mb-1.5">第 {item.period.slice(-4)} 期 · {item.drawDate}</div>
              <div className="flex flex-wrap gap-1">
                {item.numbers.map((n) => (
                  <LotteryBall key={n} number={n} size="sm" />
                ))}
                {item.specialNum?.map((n) => (
                  <LotteryBall key={`s-${n}`} number={n} size="sm" isSpecial />
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* 右：倒數 */}
        <div className="bg-gradient-to-br from-stone-900 to-stone-800 text-white p-5 flex flex-col justify-center">
          {nextDraw ? (
            <DrawCountdown targetIso={nextDraw} label="距離下次開獎" size="md" />
          ) : (
            <div className="text-amber-200 text-xs text-center">{item.drawSchedule}</div>
          )}
          <div className="mt-3 pt-3 border-t border-white/10 text-center">
            <div className="text-[10px] text-amber-300 tracking-widest">DRAW SCHEDULE</div>
            <div className="text-xs text-stone-300 mt-0.5">{item.drawSchedule}</div>
          </div>
          <Link
            href="/lottery"
            className="mt-3 inline-flex items-center justify-center gap-1 text-[10px] py-1.5 px-3 bg-white/10 hover:bg-white/20 rounded-full border border-white/20 transition-colors"
          >
            🎯 前往彩券中心 →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ===== 緊湊卡片（多彩券時用） =====
function LotteryCardCompact({ item }: { item: LotteryLatestItem }) {
  const meta = getMetaByType(item.gameType);
  const jackpot = item.jackpot ? Number(item.jackpot) : null;
  const isHot = item.noWinnerStreak >= 3;
  const drawDate = new Date(item.drawDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });

  return (
    <div className={`rounded-lg border bg-white p-3 shadow-sm hover:shadow-md transition-shadow ${isHot ? 'border-red-200' : 'border-gray-200'}`}>
      {/* 標題列 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {meta && <GameIcon meta={meta} size={20} />}
          <span className="font-bold text-sm text-gray-800">{item.gameName}</span>
        </div>
        <span className="text-xs text-gray-400">{drawDate} 第{item.period.slice(-4)}期</span>
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
      <div className="text-xs text-gray-400 mt-1 pt-1 border-t border-gray-100">🕐 {item.drawSchedule}</div>
    </div>
  );
}
