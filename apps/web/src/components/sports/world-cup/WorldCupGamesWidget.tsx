'use client';

/**
 * FIFA 世界盃 2026 — 賽事 Widget
 *
 * 設計目的：
 * - 仿 NBAGamesWidget 視覺，但分頁改用「進行中 / 即將開賽 / 已結束」
 *   （真實世界盃 6/11 才開賽，用日期 tab 大部分時候會空）
 * - 點卡片進 /match/world-cup/[matchNumber]
 * - 資料來源：/sports/world-cup/matches（純 DB，無 API-Sports 依賴）
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { wcHasScore } from '@/lib/world-cup-status';
import Link from 'next/link';
import Image from 'next/image';
import { useMemo, useRef, useState, useCallback, useEffect } from 'react';

interface TeamView {
  id: number | null;
  fifaCode: string | null;
  nameEn: string;
  nameZh: string;
  flag: string | null;
  isPlaceholder: boolean;
}

interface Match {
  id: number;
  matchNumber: number;
  round: string;
  stage: 'group' | 'knockout';
  group: string | null;
  kickoffAt: string;
  venue: string;
  home: TeamView;
  away: TeamView;
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'live' | 'finished';
  liveMinute: number | null;
}

const TABS = [
  { key: 'live', label: '進行中', color: 'bg-red-500 text-white' },
  { key: 'scheduled', label: '即將開賽', color: 'bg-blue-500 text-white' },
  { key: 'finished', label: '已結束', color: 'bg-gray-500 text-white' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function twDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function WorldCupGamesWidget() {
  const [tab, setTab] = useState<TabKey>('live');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['world-cup-matches', tab],
    queryFn: () => apiFetch<{ data: Match[] }>(`/sports/world-cup/matches?status=${tab}`),
    staleTime: 60_000,
    refetchInterval: tab === 'live' ? 30_000 : 5 * 60_000,
  });

  // 各分頁 badge 計數（並行抓 live 的數量，提示 LIVE 中）
  const { data: liveCountData } = useQuery({
    queryKey: ['world-cup-live-count'],
    queryFn: () => apiFetch<{ data: Match[] }>('/sports/world-cup/matches?status=live'),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const liveCount = liveCountData?.data.length ?? 0;

  const matches = useMemo(() => {
    const list = data?.data ?? [];
    if (tab === 'scheduled') return list.slice(0, 30); // 即將開賽顯示前 30 場避免過長
    if (tab === 'finished') return list.slice().reverse(); // 已結束反向（最新在前）
    return list;
  }, [data, tab]);

  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanL(el.scrollLeft > 4);
    setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = 0;
    requestAnimationFrame(updateScroll);
  }, [tab, matches, updateScroll]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScroll, { passive: true });
    updateScroll();
    return () => el.removeEventListener('scroll', updateScroll);
  }, [updateScroll]);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' });
  };

  const renderTeam = (t: TeamView) => (
    <div className="flex items-center gap-1 min-w-0 flex-1">
      <span className="text-base leading-none flex-shrink-0">{t.flag ?? '⚪'}</span>
      <span className={`text-[12px] truncate leading-tight ${t.isPlaceholder ? 'text-gray-400 italic' : 'text-gray-800'}`}>
        {t.nameZh}
      </span>
    </div>
  );

  const renderCard = (m: Match) => {
    const isLive = m.status === 'live';
    const isFinal = m.status === 'finished';
    const isScheduled = m.status === 'scheduled';
    // 未開賽不顯示比分（即使 seed 預填了分數）
    const showScore = wcHasScore(m.homeScore, m.awayScore) && !isScheduled;
    const homeWins = showScore && isFinal && m.homeScore! > m.awayScore!;
    const awayWins = showScore && isFinal && m.awayScore! > m.homeScore!;

    const borderCls = isLive
      ? 'border-2 border-red-400 shadow-[0_0_0_3px_rgba(248,113,113,0.2)]'
      : 'border border-gray-200';

    return (
      <Link
        key={m.id}
        href={`/match/world-cup/${m.matchNumber}`}
        className={`flex-1 basis-[180px] min-w-[180px] max-w-[280px] rounded-lg ${borderCls} bg-white px-3 py-2 shadow-sm hover:shadow-md hover:border-blue-300 transition-all`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-1.5 h-4">
          <span className="text-[10px] text-gray-400 leading-none truncate">
            {m.group ? `${m.group} · ` : ''}{m.round}
          </span>
          {isLive && (
            <span className="text-[10px] font-bold text-red-500 flex items-center gap-0.5 leading-none flex-shrink-0">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              <span>LIVE</span>
              {m.liveMinute != null && <span className="text-red-400">{m.liveMinute}'</span>}
            </span>
          )}
          {isFinal && <span className="text-[10px] font-medium text-gray-400 leading-none flex-shrink-0">已結束</span>}
          {isScheduled && (
            <span className="text-[10px] text-gray-400 leading-none flex-shrink-0">{twDateTime(m.kickoffAt)}</span>
          )}
        </div>

        {/* Home */}
        <div className="flex items-center justify-between gap-2 h-6">
          {renderTeam(m.home)}
          <span
            className={`text-sm tabular-nums leading-none ml-1 flex-shrink-0 ${
              homeWins ? 'font-bold text-gray-900' : isLive ? 'font-bold text-red-600' : 'text-gray-500'
            }`}
          >
            {showScore ? m.homeScore : ''}
          </span>
        </div>

        <div className="border-t border-gray-100 my-1" />

        {/* Away */}
        <div className="flex items-center justify-between gap-2 h-6">
          {renderTeam(m.away)}
          <span
            className={`text-sm tabular-nums leading-none ml-1 flex-shrink-0 ${
              awayWins ? 'font-bold text-gray-900' : isLive ? 'font-bold text-red-600' : 'text-gray-500'
            }`}
          >
            {showScore ? m.awayScore : ''}
          </span>
        </div>

        {/* Footer */}
        <div className="text-[10px] text-gray-400 mt-1 truncate">📍 {m.venue}</div>
      </Link>
    );
  };

  return (
    <div className="mb-4">
      {/* 標題 + Tab */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Image
            src="/images/world-cup/trophy.png"
            alt=""
            width={20}
            height={20}
            className="w-5 h-5 object-contain"
          />
          <h3 className="font-bold text-sm text-gray-800">FIFA 世界盃 2026</h3>
          <div className="flex items-center gap-0.5 ml-2">
            {TABS.map((t) => {
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${
                    isActive ? t.color : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {t.label}
                  {t.key === 'live' && liveCount > 0 && !isActive && (
                    <span className="ml-1 inline-flex items-center justify-center w-4 h-4 bg-red-500 text-white text-[9px] rounded-full">
                      {liveCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {tab === 'live' && liveCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-red-500 font-bold ml-1">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              {liveCount} LIVE
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-400 hidden sm:inline">點卡片看詳細</span>
      </div>

      <div className="relative group">
        {canL && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-0 z-10 w-7 flex items-center justify-center bg-gradient-to-r from-gray-100/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            aria-label="向左捲動"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        {canR && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-0 z-10 w-7 flex items-center justify-center bg-gradient-to-l from-gray-100/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            aria-label="向右捲動"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        <div
          ref={scrollRef}
          className={`flex gap-2 overflow-x-auto scrollbar-hide pb-1 ${matches.length < 4 ? 'justify-center' : ''}`}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center w-full h-[88px]">
              <p className="text-xs text-gray-400">載入中...</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="flex items-center justify-center w-full h-[88px]">
              <p className="text-xs text-gray-400">{TABS.find((t) => t.key === tab)?.label}無賽事</p>
            </div>
          ) : (
            matches.map(renderCard)
          )}
        </div>
      </div>
    </div>
  );
}
