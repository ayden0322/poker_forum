'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * 職棒比賽橫幅 Widget — 視覺與 MLBGamesWidget 同步
 *
 * 適用：CPBL（中華職棒）/ NPB（日本職棒）/ KBO（韓國職棒）
 * - 日期切換標籤：昨日 / 今日 / 明日
 * - 橫向滾動卡片，LIVE 紅框 + 脈衝動畫
 * - 卡片可點擊，連到 /match/baseball/{league}/{gameId}
 */

const LEAGUE_META: Record<string, { label: string }> = {
  cpbl: { label: '中華職棒' },
  npb: { label: '日本職棒' },
  kbo: { label: '韓國職棒' },
};

interface ApiTeam {
  id: number;
  name?: string;
  nameZhTw?: string;
  shortName?: string;
  logo?: string;
  score?: number | null;
}

interface ApiGame {
  id: number;
  date?: string;
  timestamp?: number;
  status?: string;
  statusShort?: string;
  teams?: {
    home?: ApiTeam;
    away?: ApiTeam;
  };
}

interface SchedResponse {
  data: ApiGame[];
}

/** 取得台灣日期（YYYY-MM-DD） */
function twDate(offsetDays = 0): string {
  const now = new Date();
  const tw = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  tw.setDate(tw.getDate() + offsetDays);
  const y = tw.getFullYear();
  const m = String(tw.getMonth() + 1).padStart(2, '0');
  const d = String(tw.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function twDateLabel(offsetDays: number): string {
  const [, m, d] = twDate(offsetDays).split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

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

function twTimeFromIso(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Taipei',
    });
  } catch {
    return '';
  }
}

/** 比賽狀態判斷（與 MLB 一致：Live / Final / Preview 三類） */
const LIVE_CODES = new Set([
  'IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'IN7', 'IN8', 'IN9',
  'LIVE', 'BT', 'P1', 'P2',
]);
const FINAL_CODES = new Set(['FT', 'AOT', 'AET', 'CANC', 'POST']);
const PREVIEW_CODES = new Set(['NS', 'TBD', 'PST']);

type AbstractState = 'Live' | 'Final' | 'Preview';

function abstractState(short?: string): AbstractState {
  const s = (short ?? 'NS').toUpperCase();
  if (LIVE_CODES.has(s)) return 'Live';
  if (FINAL_CODES.has(s)) return 'Final';
  if (PREVIEW_CODES.has(s)) return 'Preview';
  return 'Preview';
}

/** 局數文字（IN5 → 5局） */
function inningText(short?: string): string {
  const s = (short ?? '').toUpperCase();
  const m = s.match(/^IN(\d)$/);
  return m ? `${m[1]}局` : '';
}

function teamName(t?: ApiTeam): string {
  if (!t) return '未知';
  return t.shortName || t.nameZhTw || t.name || '未知';
}

/** 排序：進行中 → 即將開打 → 已結束 */
function sortGames(games: ApiGame[]): ApiGame[] {
  const rank = (s: AbstractState) => (s === 'Live' ? 0 : s === 'Preview' ? 1 : 2);
  return [...games].sort((a, b) => {
    const ra = rank(abstractState(a.statusShort));
    const rb = rank(abstractState(b.statusShort));
    if (ra !== rb) return ra - rb;
    return (a.timestamp ?? 0) - (b.timestamp ?? 0);
  });
}

const DATE_TABS = [
  { key: 'yesterday', label: '昨日', offset: -1 },
  { key: 'today', label: '今日', offset: 0 },
  { key: 'tomorrow', label: '明日', offset: 1 },
] as const;

type TabKey = (typeof DATE_TABS)[number]['key'];

async function fetchGames(league: string, date: string): Promise<ApiGame[]> {
  const res = await apiFetch<SchedResponse>(`/baseball/${league}/games/tw?date=${date}`);
  return res.data ?? [];
}

export function BaseballGamesWidget({ league }: { league: string }) {
  const meta = LEAGUE_META[league] ?? { label: league.toUpperCase() };
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const { data: yesterday } = useQuery({
    queryKey: ['baseball-tw-schedule', league, twDate(-1)],
    queryFn: () => fetchGames(league, twDate(-1)),
    staleTime: 10 * 60 * 1000,
  });

  const { data: today } = useQuery({
    queryKey: ['baseball-tw-schedule', league, twDate(0)],
    queryFn: () => fetchGames(league, twDate(0)),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const { data: tomorrow } = useQuery({
    queryKey: ['baseball-tw-schedule', league, twDate(1)],
    queryFn: () => fetchGames(league, twDate(1)),
    staleTime: 10 * 60 * 1000,
  });

  const activeGames = activeTab === 'yesterday' ? yesterday : activeTab === 'today' ? today : tomorrow;
  const sorted = activeGames ? sortGames(activeGames) : undefined;
  const liveCount = sorted?.filter((g) => abstractState(g.statusShort) === 'Live').length ?? 0;

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

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = 320;
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  const renderGameCard = (game: ApiGame) => {
    const state = abstractState(game.statusShort);
    const isLive = state === 'Live';
    const isFinal = state === 'Final';
    const isPreview = state === 'Preview';

    const awayScore = game.teams?.away?.score ?? null;
    const homeScore = game.teams?.home?.score ?? null;
    const awayWins = isFinal && awayScore != null && homeScore != null && awayScore > homeScore;
    const homeWins = isFinal && homeScore != null && awayScore != null && homeScore > awayScore;

    const borderCls = isLive
      ? 'border-2 border-red-400 shadow-[0_0_0_3px_rgba(248,113,113,0.2)] animate-pulse-border'
      : 'border border-gray-200';

    const startTime = twTimeFromTs(game.timestamp) || twTimeFromIso(game.date);
    const inning = inningText(game.statusShort);

    return (
      <Link
        key={game.id}
        href={`/match/baseball/${league}/${game.id}`}
        className={`flex-shrink-0 w-[148px] rounded-lg ${borderCls} bg-white px-2.5 py-1.5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all`}
      >
        {/* 狀態列 */}
        <div className="flex items-center justify-center mb-0.5 h-4">
          {isLive && (
            <span className="text-[10px] font-bold text-red-500 flex items-center gap-0.5 leading-none">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              <span>LIVE</span>
              {inning && <span className="text-red-400">· {inning}</span>}
            </span>
          )}
          {isFinal && <span className="text-[10px] font-medium text-gray-400 leading-none">已結束</span>}
          {isPreview && (
            <span className="text-[10px] text-gray-400 leading-none">{startTime || '—'}</span>
          )}
        </div>

        {/* 客隊 */}
        <div className="flex items-center justify-between gap-1 h-5">
          <div className="flex items-center gap-1 min-w-0">
            {game.teams?.away?.logo && (
              <img
                src={game.teams.away.logo}
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
              {teamName(game.teams?.away)}
            </span>
          </div>
          <span
            className={`text-xs tabular-nums leading-none ${
              awayWins
                ? 'font-bold text-gray-900'
                : isLive
                ? 'font-bold text-red-600'
                : 'text-gray-500'
            }`}
          >
            {awayScore ?? '-'}
          </span>
        </div>

        <div className="border-t border-gray-100 my-0.5" />

        {/* 主隊 */}
        <div className="flex items-center justify-between gap-1 h-5">
          <div className="flex items-center gap-1 min-w-0">
            {game.teams?.home?.logo && (
              <img
                src={game.teams.home.logo}
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
              {teamName(game.teams?.home)}
            </span>
          </div>
          <span
            className={`text-xs tabular-nums leading-none ${
              homeWins
                ? 'font-bold text-gray-900'
                : isLive
                ? 'font-bold text-red-600'
                : 'text-gray-500'
            }`}
          >
            {homeScore ?? '-'}
          </span>
        </div>
      </Link>
    );
  };

  return (
    <div className="mb-4">
      {/* 標題列 + 日期切換 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">⚾</span>
          <h3 className="font-bold text-sm text-gray-800">{meta.label} 比賽</h3>
          <div className="flex items-center gap-0.5 ml-2">
            {DATE_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
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

      {/* 橫向滾動區 */}
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
              <p className="text-xs text-gray-400">當日無賽事</p>
            </div>
          ) : (
            sorted.map(renderGameCard)
          )}
        </div>
      </div>
    </div>
  );
}
