'use client';

/**
 * LotteryNumberBoard — 號碼走勢盤（目前用於今彩539 看板）
 *
 * 左：1~N 全部號碼攤開，最新一期開出的標金色，近 30 期出現越多次綠色越深
 * 右：最新一期號碼 + 開獎倒數 + 對獎 / 統計入口
 *
 * 適合沒有累積頭獎、主打選號分析的彩種；大樂透、威力彩仍用 LotteryHeroCard
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { DrawCountdown } from './DrawCountdown';
import { formatDrawDate, nextDrawTime, type LotteryMeta } from './lottery-meta';

const STATS_RANGE = 30;

interface BoardItem {
  gameType: string;
  period: string;
  drawDate: string;
  numbers: number[];
}

interface StatsResponse {
  data: { totalDraws: number; frequency: { number: number; count: number }[] };
}

/** 依「出現次數 ÷ 平均次數」分四級：冷 / 溫 / 熱 / 很熱 */
function heatLevel(count: number, avg: number): 0 | 1 | 2 | 3 {
  if (avg <= 0) return 0;
  const r = count / avg;
  if (r >= 1.5) return 3;
  if (r >= 1.15) return 2;
  if (r >= 0.75) return 1;
  return 0;
}

const HEAT_CLASS = [
  'bg-gray-50 text-gray-400',
  'bg-primary-100 text-primary-800',
  'bg-primary-200 text-primary-900',
  'bg-primary-400 text-white',
] as const;

const GOLD_BALL =
  'bg-[radial-gradient(circle_at_32%_28%,#f6d77a,#c8901a_72%)] text-amber-950 shadow-[0_2px_5px_rgba(200,144,26,0.35)]';

export function LotteryNumberBoard({ item, meta }: { item: BoardItem; meta: LotteryMeta }) {
  const { data, isLoading } = useQuery({
    queryKey: ['lottery-stats', item.gameType, STATS_RANGE],
    queryFn: () => apiFetch<StatsResponse>(`/lottery/stats?gameType=${item.gameType}&range=${STATS_RANGE}`),
    staleTime: 5 * 60 * 1000,
  });

  const [min, max] = meta.ballRange.main;
  const totalDraws = data?.data.totalDraws ?? 0;
  const countMap = new Map(data?.data.frequency.map((f) => [f.number, f.count]) ?? []);
  // 平均每個號碼的出現次數 = 期數 × 每期開出幾顆 ÷ 號碼總數
  const avg = (totalDraws * meta.ballRange.mainCount) / (max - min + 1);
  const hotThreshold = Math.ceil(avg * 1.5);
  const hits = new Set(item.numbers);
  const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const nextDraw = nextDrawTime(meta).toISOString();
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="grid md:grid-cols-[1fr_300px] rounded-2xl overflow-hidden border border-primary-100 shadow-sm">
      {/* 右（手機在上）：最新一期 + 倒數 */}
      <div className="md:order-last bg-[#1f2a30] text-white p-4 md:p-5 flex flex-col justify-center gap-4">
        <div>
          <div className="text-sm text-white/70">
            {formatDrawDate(item.drawDate)} 第 {Number(item.period.slice(-4))} 期
          </div>
          <div className="flex gap-1.5 mt-2">
            {item.numbers.map((n) => (
              <span
                key={n}
                className={`w-9 h-9 rounded-full inline-flex items-center justify-center font-bold tabular-nums ${GOLD_BALL}`}
              >
                {pad(n)}
              </span>
            ))}
          </div>
        </div>
        <div className="border-t border-white/10 pt-4">
          <DrawCountdown targetIso={nextDraw} label={`下次開獎・${meta.schedule}`} size="md" align="start" />
        </div>
        <div className="flex gap-2">
          <Link
            href={`/lottery/check?gameType=${item.gameType}`}
            className="flex-1 text-center text-sm font-semibold py-2 rounded-full bg-white text-[#1f2a30] hover:bg-primary-50 transition-colors"
          >
            我要對獎
          </Link>
          <Link
            href={`/lottery/stats?gameType=${item.gameType}`}
            className="flex-1 text-center text-sm font-semibold py-2 rounded-full bg-white/10 border border-white/25 hover:bg-white/20 transition-colors"
          >
            完整統計 →
          </Link>
        </div>
      </div>

      {/* 左（手機在下）：號碼走勢盤 */}
      <div className="bg-white p-4 md:p-5">
        <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
          <h2 className="font-bold text-gray-800">號碼走勢盤</h2>
          <span className="text-sm text-gray-500">
            {totalDraws > 0 ? `近 ${totalDraws} 期出現次數` : isLoading ? '統計載入中…' : '尚無統計資料'}
          </span>
        </div>
        <div className="grid grid-cols-8 sm:grid-cols-[repeat(13,minmax(0,1fr))] gap-1.5">
          {nums.map((n) => {
            const count = countMap.get(n) ?? 0;
            const isHit = hits.has(n);
            const cls = isHit ? `rounded-full ${GOLD_BALL}` : `rounded-lg ${HEAT_CLASS[heatLevel(count, avg)]}`;
            return (
              <div
                key={n}
                title={totalDraws > 0 ? `${pad(n)}：近 ${totalDraws} 期開出 ${count} 次` : undefined}
                className={`aspect-square flex items-center justify-center text-sm font-semibold tabular-nums ${cls}`}
              >
                {pad(n)}
              </div>
            );
          })}
        </div>
        <div className="flex gap-x-4 gap-y-1 items-center flex-wrap text-xs text-gray-500 mt-3">
          <span className="inline-flex items-center gap-1">
            <i className={`w-3 h-3 rounded-full ${GOLD_BALL}`} />
            第 {Number(item.period.slice(-4))} 期開出
          </span>
          {totalDraws > 0 && (
            <>
              <span className="inline-flex items-center gap-1">
                <i className="w-3 h-3 rounded-sm bg-primary-400" />熱（{hotThreshold} 次以上）
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="w-3 h-3 rounded-sm bg-primary-100" />溫
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="w-3 h-3 rounded-sm bg-gray-50 border border-gray-200" />冷
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
