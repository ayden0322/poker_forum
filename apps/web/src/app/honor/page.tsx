'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface Row {
  rank: number;
  nickname: string;
  profit: number;
  winRate: number;
  n: number;
  avgOdds: number;
}
interface Champion {
  board: string;
  nickname: string;
  avatar: string | null;
  reignTo: string;
}
interface HofRecord {
  recordType: string;
  nickname: string;
  value: number;
  context: string | null;
  achievedAt: string;
}
interface InfluenceRow {
  rank: number;
  nickname: string;
  follows: number;
}
interface Overview {
  enabled: boolean;
  periodStart: string;
  accuracy: Row[];
  profit: Row[];
  influence: InfluenceRow[];
  champions: Champion[];
  hallOfFame: HofRecord[];
}

const BOARD_LABEL: Record<string, string> = { ACCURACY: '神算王', PROFIT: '獲利王', INFLUENCE: '人氣王' };
const HOF_LABEL: Record<string, string> = {
  LONGEST_STREAK: '最長連勝紀錄',
  BIGGEST_UPSET: '最大冷門命中',
  BEST_MONTH_ACC: '單月最高準度',
  TOP_INFLUENCE: '影響力王',
};

function hofValue(t: string, v: number): string {
  if (t === 'LONGEST_STREAK') return `${v} 連`;
  if (t === 'BIGGEST_UPSET') return `賠率 ${v}`;
  if (t === 'BEST_MONTH_ACC') return `${v}%`;
  return `${v}`;
}

function Board({ title, sub, rows, metric }: { title: string; sub: string; rows: Row[]; metric: (r: Row) => string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-extrabold text-teal-700">{title}</h3>
        <span className="text-xs text-gray-400">{sub}</span>
      </div>
      {rows.length === 0 && <p className="py-6 text-center text-sm text-gray-400">本季尚無人達 30 場門檻</p>}
      <div className="space-y-0.5">
        {rows.slice(0, 10).map((r) => (
          <Link
            key={r.nickname}
            href={`/user/${encodeURIComponent(r.nickname)}`}
            className={`flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-gray-50 ${
              r.rank === 1 ? 'bg-gradient-to-r from-amber-50 to-transparent' : ''
            }`}
          >
            <span className={`w-5 text-center text-sm font-extrabold ${r.rank === 1 ? 'text-amber-500' : 'text-gray-300'}`}>
              {r.rank}
            </span>
            <span className="flex-1 truncate text-sm font-bold text-gray-800">
              {r.nickname}
              {r.rank === 1 && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">冠軍</span>
              )}
              <span className="ml-1.5 text-xs font-normal text-gray-400">{r.n} 場</span>
            </span>
            <span className={`text-sm font-extrabold tabular-nums ${r.rank === 1 ? 'text-amber-500' : 'text-teal-700'}`}>
              {metric(r)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function HonorPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['honor', 'overview'],
    queryFn: () => apiFetch<{ data: Overview }>('/honor/overview').then((r) => r.data),
  });

  const monthLabel = data ? new Date(data.periodStart).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' }) : '';

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-1 text-xs font-extrabold uppercase tracking-widest text-teal-600">榮譽殿堂</div>
      <h1 className="text-2xl font-extrabold text-gray-900">博客邦 榮譽系統</h1>
      <p className="mt-1 text-sm text-gray-500">
        榮耀只能靠戰績賺、買不到。冠軍每月加冕、紀錄永久留名。{monthLabel && `本季：${monthLabel}`}
      </p>

      {isLoading && <div className="py-16 text-center text-gray-400">載入中…</div>}

      {data && (
        <div className="mt-5 space-y-5">
          {/* 在位冠軍 */}
          {data.champions.length > 0 && (
            <div
              className="rounded-2xl p-5 text-white shadow-sm"
              style={{
                background:
                  'radial-gradient(120% 160% at 88% -20%, rgba(245,158,11,0.5), transparent 55%), linear-gradient(100deg,#0b3b39,#0f766e)',
              }}
            >
              <div className="text-[11px] font-extrabold uppercase tracking-widest text-amber-300">◆ 本季在位冠軍</div>
              <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
                {data.champions.map((c) => (
                  <Link key={c.board} href={`/user/${encodeURIComponent(c.nickname)}`} className="group">
                    <div className="text-xs text-white/70">本季{BOARD_LABEL[c.board] ?? c.board}</div>
                    <div className="text-lg font-extrabold text-amber-200 group-hover:underline">{c.nickname}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 三榜 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Board title="神算王榜" sub="本季準度" rows={data.accuracy} metric={(r) => `${r.winRate}%`} />
            <Board title="獲利王榜" sub="本季 P 幣淨利" rows={data.profit} metric={(r) => `${r.profit > 0 ? '+' : ''}${r.profit.toLocaleString()}`} />
          </div>
          {/* 人氣王榜（被跟單） */}
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-extrabold text-teal-700">人氣王榜</h3>
              <span className="text-xs text-gray-400">本季被跟單數</span>
            </div>
            {data.influence.length === 0 && <p className="py-6 text-center text-sm text-gray-400">本季尚無跟單紀錄</p>}
            <div className="space-y-0.5">
              {data.influence.slice(0, 10).map((r) => (
                <Link
                  key={r.nickname}
                  href={`/user/${encodeURIComponent(r.nickname)}`}
                  className={`flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-gray-50 ${
                    r.rank === 1 ? 'bg-gradient-to-r from-amber-50 to-transparent' : ''
                  }`}
                >
                  <span className={`w-5 text-center text-sm font-extrabold ${r.rank === 1 ? 'text-amber-500' : 'text-gray-300'}`}>
                    {r.rank}
                  </span>
                  <span className="flex-1 truncate text-sm font-bold text-gray-800">
                    {r.nickname}
                    {r.rank === 1 && (
                      <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">人氣王</span>
                    )}
                  </span>
                  <span className={`text-sm font-extrabold tabular-nums ${r.rank === 1 ? 'text-amber-500' : 'text-teal-700'}`}>
                    {r.follows.toLocaleString()} 跟
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* 名人堂 */}
          <div
            className="rounded-2xl p-5"
            style={{ background: 'linear-gradient(160deg,#14201f,#0e1a19)' }}
          >
            <div className="mb-3 text-sm font-extrabold tracking-wider text-amber-300">◆ 博客邦 名人堂 · 永久紀錄</div>
            {data.hallOfFame.length === 0 && <p className="py-4 text-center text-sm text-white/40">尚無紀錄</p>}
            <div className="divide-y divide-white/10">
              {data.hallOfFame.map((h) => (
                <div key={h.recordType} className="flex items-center gap-4 py-2.5">
                  <span className="w-28 flex-shrink-0 text-xs font-bold text-teal-300/80">{HOF_LABEL[h.recordType] ?? h.recordType}</span>
                  <Link href={`/user/${encodeURIComponent(h.nickname)}`} className="flex-1">
                    <div className="text-sm font-bold text-white hover:underline">{h.nickname}</div>
                    {h.context && <div className="text-[11px] text-white/50">{h.context}</div>}
                  </Link>
                  <span className="text-base font-extrabold tabular-nums text-amber-300">{hofValue(h.recordType, h.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
