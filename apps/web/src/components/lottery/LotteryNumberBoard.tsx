'use client';

/**
 * LotteryNumberBoard — 號碼走勢盤（今彩539、大樂透、威力彩看板）
 *
 * 左：1~N 全部號碼攤開，最新一期開出的標金色，近 30 期出現越多次綠色越深
 *     大樂透特別號與主號同池 → 直接在盤上標紅球
 *     威力彩第二區是獨立的 1~8 → 下方另一排小盤
 * 右：累積頭獎（有才顯示）+ 最新一期號碼 + 開獎倒數 + 對獎 / 統計入口
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
  specialNum: number[] | null;
  jackpot: string | null;
  noWinnerStreak: number;
}

interface NumCount {
  number: number;
  count: number;
}

interface StatsResponse {
  data: { totalDraws: number; frequency: NumCount[]; specialFrequency: NumCount[] };
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
const RED_BALL =
  'bg-[radial-gradient(circle_at_32%_28%,#f59a8b,#c0392b_72%)] text-white shadow-[0_2px_5px_rgba(192,57,43,0.35)]';

const pad = (n: number) => String(n).padStart(2, '0');

function formatJackpot(jackpot: number): { value: string; unit: string } {
  return jackpot >= 100_000_000
    ? { value: (jackpot / 100_000_000).toFixed(2), unit: '億' }
    : { value: (jackpot / 10_000).toFixed(0), unit: '萬' };
}

/** 一組號碼格（主盤或第二區共用） */
function NumberGrid({
  range,
  countMap,
  avg,
  totalDraws,
  hits,
  specialHits,
  className,
}: {
  range: [number, number];
  countMap: Map<number, number>;
  avg: number;
  totalDraws: number;
  hits: Set<number>;
  specialHits: Set<number>;
  className: string;
}) {
  const [min, max] = range;
  const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className={`grid gap-1.5 ${className}`}>
      {nums.map((n) => {
        const count = countMap.get(n) ?? 0;
        const cls = hits.has(n)
          ? `rounded-full ${GOLD_BALL}`
          : specialHits.has(n)
            ? `rounded-full ${RED_BALL}`
            : `rounded-lg ${HEAT_CLASS[heatLevel(count, avg)]}`;
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
  );
}

export function LotteryNumberBoard({ item, meta }: { item: BoardItem; meta: LotteryMeta }) {
  const { data, isLoading } = useQuery({
    queryKey: ['lottery-stats', item.gameType, STATS_RANGE],
    queryFn: () => apiFetch<StatsResponse>(`/lottery/stats?gameType=${item.gameType}&range=${STATS_RANGE}`),
    staleTime: 5 * 60 * 1000,
  });

  const { main, mainCount, special, specialCount } = meta.ballRange;
  const totalDraws = data?.data.totalDraws ?? 0;
  const countMap = new Map(data?.data.frequency.map((f) => [f.number, f.count]) ?? []);
  const specialCountMap = new Map(data?.data.specialFrequency?.map((f) => [f.number, f.count]) ?? []);
  // 平均每個號碼的出現次數 = 期數 × 每期開出幾顆 ÷ 號碼總數
  const avg = (totalDraws * mainCount) / (main[1] - main[0] + 1);
  const hotThreshold = Math.ceil(avg * 1.5);

  const specials = item.specialNum ?? [];
  // 特別號和主號同一個號碼池（大樂透）→ 標在主盤；不同池（威力彩第二區）→ 另外一排
  const separateZone =
    special && (special[0] !== main[0] || special[1] !== main[1]) ? (special as [number, number]) : null;
  const specialLabel = separateZone ? '第二區' : '特別號';
  const specialAvg = separateZone ? (totalDraws * (specialCount ?? 1)) / (separateZone[1] - separateZone[0] + 1) : 0;

  const hits = new Set(item.numbers);
  const mainSpecialHits = separateZone ? new Set<number>() : new Set(specials);
  const jackpot = item.jackpot ? Number(item.jackpot) : null;
  const periodNo = Number(item.period.slice(-4));
  const nextDraw = nextDrawTime(meta).toISOString();
  // 大樂透、威力彩一期 7 顆，右欄 300px 放不下 36px 的球 → 縮小一號
  const ballSize = item.numbers.length + specials.length > 6 ? 'w-8 h-8 text-sm' : 'w-9 h-9';
  // 49 顆時桌機一排 13 格會變 4 排；手機 8 格一排
  const mainCols = 'grid-cols-8 sm:grid-cols-[repeat(13,minmax(0,1fr))]';

  return (
    <div className="grid md:grid-cols-[1fr_300px] rounded-2xl overflow-hidden border border-primary-100 shadow-sm">
      {/* 右（手機在上）：頭獎 + 最新一期 + 倒數 */}
      <div className="md:order-last bg-[#1f2a30] text-white p-4 md:p-5 flex flex-col justify-center gap-4">
        {jackpot ? (
          <div>
            <div className="flex items-center gap-2 text-sm text-white/70">
              本期累積頭獎
              {item.noWinnerStreak >= 3 && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-300 bg-amber-300/10 border border-amber-300/30 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-amber-300 rounded-full animate-pulse" />連 {item.noWinnerStreak} 期未中
                </span>
              )}
            </div>
            <div className="mt-1 font-bold tabular-nums leading-none text-amber-300">
              <span className="text-4xl">{formatJackpot(jackpot).value}</span>
              <span className="text-lg ml-1.5">{formatJackpot(jackpot).unit}</span>
            </div>
          </div>
        ) : null}
        <div className={jackpot ? 'border-t border-white/10 pt-4' : ''}>
          <div className="text-sm text-white/70">
            {formatDrawDate(item.drawDate)} 第 {periodNo} 期
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {item.numbers.map((n) => (
              <span
                key={n}
                className={`${ballSize} rounded-full inline-flex items-center justify-center font-bold tabular-nums ${GOLD_BALL}`}
              >
                {pad(n)}
              </span>
            ))}
            {specials.map((n) => (
              <span
                key={`s-${n}`}
                title={specialLabel}
                className={`${ballSize} rounded-full inline-flex items-center justify-center font-bold tabular-nums ${RED_BALL}`}
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
          <h2 className="font-bold text-gray-800">{separateZone ? '第一區走勢盤' : '號碼走勢盤'}</h2>
          <span className="text-sm text-gray-500">
            {totalDraws > 0 ? `近 ${totalDraws} 期出現次數` : isLoading ? '統計載入中…' : '尚無統計資料'}
          </span>
        </div>
        <NumberGrid
          range={main}
          countMap={countMap}
          avg={avg}
          totalDraws={totalDraws}
          hits={hits}
          specialHits={mainSpecialHits}
          className={mainCols}
        />

        {separateZone && (
          <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
            <h3 className="font-bold text-gray-800 text-sm mb-2">第二區</h3>
            <NumberGrid
              range={separateZone}
              countMap={specialCountMap}
              avg={specialAvg}
              totalDraws={totalDraws}
              hits={new Set()}
              specialHits={new Set(specials)}
              className={mainCols}
            />
          </div>
        )}

        <div className="flex gap-x-4 gap-y-1 items-center flex-wrap text-xs text-gray-500 mt-3">
          <span className="inline-flex items-center gap-1">
            <i className={`w-3 h-3 rounded-full ${GOLD_BALL}`} />第 {periodNo} 期開出
          </span>
          {specials.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <i className={`w-3 h-3 rounded-full ${RED_BALL}`} />
              {specialLabel}
            </span>
          )}
          {totalDraws > 0 && (
            <>
              <span className="inline-flex items-center gap-1">
                <i className="w-3 h-3 rounded-sm bg-primary-400" />熱{separateZone ? '' : `（${hotThreshold} 次以上）`}
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
