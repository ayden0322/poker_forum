'use client';

/**
 * NBA 比賽橫幅 Widget — 仿 MLBGamesWidget 設計
 *
 * - 日期 Tab：昨日 / 今日 / 明日（預設今日）
 * - 橫向滾動，hover 顯示左右箭頭
 * - LIVE 比賽：紅框 + 脈衝動畫 + 即時節數
 * - 點擊卡片 → /match/nba/apisports-{apiSportsGameId}
 *
 * 資料來源：/sports/nba/recent（API-Sports basketball v1）
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useState, useRef, useCallback, useEffect } from 'react';

interface RecentGame {
  id: number;
  date: string;
  time: string;
  timestamp?: number;
  status: { long?: string; short?: string; timer?: string | null };
  league?: { id?: number };
  teams: {
    home: { id: number; name: string; logo?: string };
    away: { id: number; name: string; logo?: string };
  };
  scores: {
    home: { quarter_1?: number; quarter_2?: number; quarter_3?: number; quarter_4?: number; over_time?: number | null; total: number | null };
    away: { quarter_1?: number; quarter_2?: number; quarter_3?: number; quarter_4?: number; over_time?: number | null; total: number | null };
  };
}

interface RecentResponse {
  data: { yesterday: RecentGame[]; today: RecentGame[]; tomorrow: RecentGame[] };
}

const DATE_TABS = [
  { key: 'yesterday', label: '昨日', offset: -1 },
  { key: 'today', label: '今日', offset: 0 },
  { key: 'tomorrow', label: '明日', offset: 1 },
] as const;
type TabKey = (typeof DATE_TABS)[number]['key'];

/** 取得台灣日期 MM/DD */
function twDateLabel(offset: number): string {
  const now = new Date();
  const tw = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  tw.setDate(tw.getDate() + offset);
  return `${tw.getMonth() + 1}/${tw.getDate()}`;
}

/** 用 timestamp（秒）格式化台灣時區 HH:MM */
function twTimeFromTs(ts?: number): string {
  if (!ts) return '';
  try {
    return new Date(ts * 1000).toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Taipei',
    });
  } catch {
    return '';
  }
}

/** 比賽狀態判斷 (API-Sports basketball v1 的 status.short) */
function gameState(short?: string): 'live' | 'final' | 'preview' {
  if (!short) return 'preview';
  if (['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'BT', 'HT'].includes(short)) return 'live';
  if (short === 'FT' || short === 'AOT') return 'final';
  return 'preview';
}

/** 排序：LIVE → Preview → Final */
function sortGames(games: RecentGame[]): RecentGame[] {
  return [...games].sort((a, b) => {
    const ra = gameState(a.status.short) === 'live' ? 0 : gameState(a.status.short) === 'preview' ? 1 : 2;
    const rb = gameState(b.status.short) === 'live' ? 0 : gameState(b.status.short) === 'preview' ? 1 : 2;
    if (ra !== rb) return ra - rb;
    return (a.timestamp ?? 0) - (b.timestamp ?? 0);
  });
}

export function NBAGamesWidget() {
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const { data } = useQuery({
    queryKey: ['nba-recent'],
    queryFn: () => apiFetch<RecentResponse>('/sports/nba/recent'),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  /**
   * 後端按 UTC 日期分桶；對台灣使用者來說，UTC 23:00 的比賽其實是「台灣明天清晨」。
   * 這裡把三天比賽合併後按台灣日期 (Asia/Taipei) 重新分桶。
   */
  const tzBuckets = (() => {
    const empty = { yesterday: [] as RecentGame[], today: [] as RecentGame[], tomorrow: [] as RecentGame[] };
    if (!data?.data) return null;
    const all = [...data.data.yesterday, ...data.data.today, ...data.data.tomorrow];
    const seen = new Set<number>();
    const dedup = all.filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)));

    // 取台灣「今天」的 YYYY-MM-DD 字串
    const tw0 = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }); // YYYY-MM-DD
    const tw1Date = new Date(tw0 + 'T00:00:00');
    tw1Date.setDate(tw1Date.getDate() + 1);
    const tw1 = tw1Date.toLocaleDateString('en-CA');
    tw1Date.setDate(tw1Date.getDate() - 2);
    const twM1 = tw1Date.toLocaleDateString('en-CA');

    for (const g of dedup) {
      if (!g.timestamp) continue;
      const twDay = new Date(g.timestamp * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
      if (twDay === twM1) empty.yesterday.push(g);
      else if (twDay === tw0) empty.today.push(g);
      else if (twDay === tw1) empty.tomorrow.push(g);
    }
    return empty;
  })();

  const buckets = tzBuckets;
  const activeGames = buckets ? buckets[activeTab] : undefined;
  const sorted = activeGames ? sortGames(activeGames) : undefined;
  const liveCount = sorted?.filter((g) => gameState(g.status.short) === 'live').length ?? 0;

  /** 即時節數 (例：Q3) */
  const liveText = (g: RecentGame) => {
    const s = g.status.short ?? '';
    if (s === 'HT') return '半場';
    if (s === 'BT') return '節間';
    if (['Q1', 'Q2', 'Q3', 'Q4', 'OT'].includes(s)) {
      const timer = g.status.timer ? ` ${g.status.timer}` : '';
      return `${s}${timer}`;
    }
    return s;
  };

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = 0;
    requestAnimationFrame(updateScrollState);
  }, [activeTab, sorted, updateScrollState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    updateScrollState();
    return () => el.removeEventListener('scroll', updateScrollState);
  }, [updateScrollState]);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = 320;
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  const renderCard = (g: RecentGame) => {
    const state = gameState(g.status.short);
    const isLive = state === 'live';
    const isFinal = state === 'final';
    const isPreview = state === 'preview';
    const awayTotal = g.scores.away.total;
    const homeTotal = g.scores.home.total;
    const awayWins = isFinal && awayTotal != null && homeTotal != null && awayTotal > homeTotal;
    const homeWins = isFinal && awayTotal != null && homeTotal != null && homeTotal > awayTotal;

    const borderCls = isLive
      ? 'border-2 border-red-400 shadow-[0_0_0_3px_rgba(248,113,113,0.2)]'
      : 'border border-gray-200';

    return (
      <Link
        key={g.id}
        href={`/match/nba/apisports-${g.id}`}
        className={`flex-1 basis-[148px] min-w-[148px] max-w-[260px] rounded-lg ${borderCls} bg-white px-2.5 py-1.5 shadow-sm hover:shadow-md hover:border-orange-300 transition-all`}
      >
        <div className="flex items-center justify-center mb-0.5 h-4">
          {isLive && (
            <span className="text-[10px] font-bold text-red-500 flex items-center gap-0.5 leading-none">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              <span>LIVE</span>
              {liveText(g) && <span className="text-red-400">· {liveText(g)}</span>}
            </span>
          )}
          {isFinal && <span className="text-[10px] font-medium text-gray-400 leading-none">已結束</span>}
          {isPreview && (
            <span className="text-[10px] text-gray-400 leading-none">{twTimeFromTs(g.timestamp) || g.time}</span>
          )}
        </div>

        {/* 客隊 */}
        <div className="flex items-center justify-between gap-1 h-5">
          <div className="flex items-center gap-1 min-w-0">
            {g.teams.away.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={g.teams.away.logo}
                alt=""
                className="w-3.5 h-3.5 object-contain flex-shrink-0"
                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
              />
            )}
            <span
              className={`text-[11px] truncate leading-none ${
                awayWins ? 'font-bold text-gray-900' : isLive ? 'text-gray-800' : 'text-gray-600'
              }`}
            >
              {g.teams.away.name}
            </span>
          </div>
          <span
            className={`text-xs tabular-nums leading-none ${
              awayWins ? 'font-bold text-gray-900' : isLive ? 'font-bold text-red-600' : 'text-gray-500'
            }`}
          >
            {awayTotal ?? '-'}
          </span>
        </div>

        <div className="border-t border-gray-100 my-0.5" />

        {/* 主隊 */}
        <div className="flex items-center justify-between gap-1 h-5">
          <div className="flex items-center gap-1 min-w-0">
            {g.teams.home.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={g.teams.home.logo}
                alt=""
                className="w-3.5 h-3.5 object-contain flex-shrink-0"
                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
              />
            )}
            <span
              className={`text-[11px] truncate leading-none ${
                homeWins ? 'font-bold text-gray-900' : isLive ? 'text-gray-800' : 'text-gray-600'
              }`}
            >
              {g.teams.home.name}
            </span>
          </div>
          <span
            className={`text-xs tabular-nums leading-none ${
              homeWins ? 'font-bold text-gray-900' : isLive ? 'font-bold text-red-600' : 'text-gray-500'
            }`}
          >
            {homeTotal ?? '-'}
          </span>
        </div>
      </Link>
    );
  };

  return (
    <div className="mb-4">
      {/* 標題列 + 日期 Tab */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">🏀</span>
          <h3 className="font-bold text-sm text-gray-800">NBA 比賽</h3>
          <div className="flex items-center gap-0.5 ml-2">
            {DATE_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    isActive ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {tab.label} {twDateLabel(tab.offset)}
                </button>
              );
            })}
          </div>
          {liveCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-red-500 font-bold ml-1">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              {liveCount} LIVE
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-400 hidden sm:inline">點卡片看詳細戰報</span>
      </div>

      <div className="relative group">
        {canScrollLeft && (
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
        {canScrollRight && (
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
          className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 justify-center"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {!sorted ? (
            <div className="flex items-center justify-center w-full h-[76px]">
              <p className="text-xs text-gray-400">載入中...</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex items-center justify-center w-full h-[76px]">
              <p className="text-xs text-gray-400">{DATE_TABS.find((t) => t.key === activeTab)?.label}無賽事</p>
            </div>
          ) : (
            sorted.map(renderCard)
          )}
        </div>
      </div>
    </div>
  );
}
