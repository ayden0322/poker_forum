'use client';

/**
 * 國際足球友誼賽 — 單場詳情頁
 * 呈現對戰雙方（真 logo + 中文隊名 + 比分）、狀態、開賽時間、場館、輪次。
 * 卡片/詳情皆不放賠率氛圍（內容站調性）；非焦點戰由 server 端 metadata 設 noindex。
 */

import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface TeamView {
  id: number;
  nameEn: string;
  nameZh: string;
  logoUrl: string | null;
  isMarquee: boolean;
}

interface Match {
  id: number;
  round: string | null;
  kickoffAt: string;
  venue: string | null;
  venueCity: string | null;
  home: TeamView;
  away: TeamView;
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'live' | 'finished';
  liveMinute: number | null;
  isFeatured: boolean;
}

function fmtTw(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function StatusBadge({ status, liveMinute }: { status: Match['status']; liveMinute: number | null }) {
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500 text-white rounded-full text-sm font-bold">
        <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
        LIVE {liveMinute != null && `· ${liveMinute}'`}
      </span>
    );
  }
  if (status === 'finished') {
    return <span className="inline-flex items-center px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-sm font-medium">已結束</span>;
  }
  return <span className="inline-flex items-center px-3 py-1 bg-[#39B8BE]/10 text-[#2C8E93] rounded-full text-sm font-medium">尚未開賽</span>;
}

function TeamBlock({ t }: { t: TeamView }) {
  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      {t.logoUrl ? (
        <Image src={t.logoUrl} alt={t.nameZh} width={56} height={56} className="w-14 h-14 object-contain" />
      ) : (
        <span className="w-14 h-14 flex items-center justify-center text-3xl text-gray-300">⚪</span>
      )}
      <div className="text-center w-full">
        <div className="font-bold text-gray-800 text-sm truncate">{t.nameZh}</div>
        {t.nameZh !== t.nameEn && <div className="text-[11px] text-gray-400 truncate">{t.nameEn}</div>}
      </div>
    </div>
  );
}

export default function FriendlyMatchPageClient({ matchId }: { matchId: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['friendly-match', matchId],
    queryFn: () => apiFetch<{ data: Match }>(`/sports/friendlies/match/${matchId}`),
    staleTime: 60_000,
    refetchInterval: (q) => (q.state.data?.data.status === 'live' ? 30_000 : false),
  });

  const m = data?.data;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/board/friendlies" className="text-sm text-[#2C8E93] hover:underline">
        ← 回國際友誼賽
      </Link>

      {isLoading ? (
        <div className="text-center text-gray-400 py-16">載入中...</div>
      ) : isError || !m ? (
        <div className="text-center text-gray-400 py-16">找不到這場比賽</div>
      ) : (
        <>
          <div className="mt-3 rounded-xl border border-gray-200 bg-white shadow-sm p-5">
            <div className="flex items-center justify-center gap-2 mb-4">
              {m.isFeatured && <span className="text-xs font-bold text-amber-500">🔥 焦點戰</span>}
              <span className="text-xs text-gray-400">{m.round ?? '國際友誼賽'}</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <TeamBlock t={m.home} />
              <div className="flex flex-col items-center gap-2 flex-shrink-0">
                {m.status === 'scheduled' ? (
                  <span className="text-2xl font-bold text-gray-300">VS</span>
                ) : (
                  <span className={`text-3xl font-bold tabular-nums ${m.status === 'live' ? 'text-red-600' : 'text-gray-900'}`}>
                    {m.homeScore ?? 0} <span className="text-gray-300">-</span> {m.awayScore ?? 0}
                  </span>
                )}
                <StatusBadge status={m.status} liveMinute={m.liveMinute} />
              </div>
              <TeamBlock t={m.away} />
            </div>
          </div>

          {/* 賽事資訊 */}
          <div className="mt-3 rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-50">
            <Info label="開賽時間" value={fmtTw(m.kickoffAt)} />
            <Info label="賽事" value="國際足球友誼賽 2026" />
            {m.venue && <Info label="場館" value={`${m.venue}${m.venueCity ? `（${m.venueCity}）` : ''}`} />}
          </div>
        </>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700 font-medium text-right">{value}</span>
    </div>
  );
}
