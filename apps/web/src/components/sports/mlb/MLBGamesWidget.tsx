'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * MLB 比賽橫幅 Widget — 橫向滾動樣式（類似 NBA 官網頂部賽程橫幅）
 *
 * - 日期切換標籤：昨日 / 今日 / 明日，預設顯示「今日」
 * - 所有比賽卡片水平排列，可左右捲動
 * - LIVE 比賽：紅色邊框 + 脈衝動畫
 * - 每張卡片可點擊，連到 /match/mlb/{gamePk}
 */

interface Game {
  gamePk: number;
  officialDate: string;
  gameDate: string;
  status: {
    abstractGameState: string; // Live | Final | Preview
    detailedState: string;
    statusCode: string;
  };
  teams: {
    away: { team: { id: number; name: string }; score?: number };
    home: { team: { id: number; name: string }; score?: number };
  };
  linescore?: {
    currentInning?: number;
    inningState?: string; // Top | Bottom | Middle | End
    inningHalf?: string;
    isTopInning?: boolean;
  };
}

interface TeamTranslation {
  mlbStatsTeamId: number;
  nameZhTw: string;
  shortName?: string;
}

/** 取得台灣日期（YYYY-MM-DD） */
function twDate(offsetDays: number = 0): string {
  const now = new Date();
  const twString = now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' });
  const tw = new Date(twString);
  tw.setDate(tw.getDate() + offsetDays);
  const y = tw.getFullYear();
  const m = String(tw.getMonth() + 1).padStart(2, '0');
  const d = String(tw.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 顯示台灣日期的 MM/DD */
function twDateLabel(offsetDays: number): string {
  const dateStr = twDate(offsetDays);
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

/** 將 UTC 時間轉成台灣時間 HH:MM */
function twTime(utcStr: string): string {
  try {
    return new Date(utcStr).toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Taipei',
    });
  } catch {
    return '';
  }
}

async function fetchGames(date: string): Promise<Game[]> {
  const res = await apiFetch<{ data: Game[] }>(`/mlb/schedule/tw?date=${date}`);
  return res.data ?? [];
}

async function fetchTeamTranslations(): Promise<Map<number, TeamTranslation>> {
  const res = await apiFetch<{ data: Array<{ id: number; nameZhTw: string; shortName?: string }> }>(
    '/mlb/teams',
  );
  return new Map(
    res.data.map((t) => [
      t.id,
      { mlbStatsTeamId: t.id, nameZhTw: t.nameZhTw, shortName: t.shortName },
    ]),
  );
}

/** 比賽排序：進行中 → 即將開打 → 已結束 */
function sortGames(games: Game[]): Game[] {
  return [...games].sort((a, b) => {
    const aState = a.status.abstractGameState;
    const bState = b.status.abstractGameState;
    const rank = (s: string) => (s === 'Live' ? 0 : s === 'Preview' ? 1 : 2);
    if (rank(aState) !== rank(bState)) return rank(aState) - rank(bState);
    return new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime();
  });
}

/** 日期標籤定義 */
const DATE_TABS = [
  { key: 'yesterday', label: '昨日', offset: -1 },
  { key: 'today', label: '今日', offset: 0 },
  { key: 'tomorrow', label: '明日', offset: 1 },
] as const;

type TabKey = (typeof DATE_TABS)[number]['key'];

export function MLBGamesWidget() {
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const scrollRef = useRef<HTMLDivElement>(null);
  /** 追蹤是否可往左/右捲動，用於顯示箭頭按鈕 */
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const { data: translations } = useQuery({
    queryKey: ['mlb-team-translations'],
    queryFn: fetchTeamTranslations,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { data: yesterday } = useQuery({
    queryKey: ['mlb-tw-schedule', twDate(-1)],
    queryFn: () => fetchGames(twDate(-1)),
    staleTime: 10 * 60 * 1000,
  });

  const { data: today } = useQuery({
    queryKey: ['mlb-tw-schedule', twDate(0)],
    queryFn: () => fetchGames(twDate(0)),
    staleTime: 10 * 1000,
    refetchInterval: 10 * 1000, // 10 秒刷新
  });

  const { data: tomorrow } = useQuery({
    queryKey: ['mlb-tw-schedule', twDate(1)],
    queryFn: () => fetchGames(twDate(1)),
    staleTime: 10 * 60 * 1000,
  });

  /** 根據當前 tab 取得對應比賽資料 */
  const activeGames = activeTab === 'yesterday' ? yesterday : activeTab === 'today' ? today : tomorrow;
  const sorted = activeGames ? sortGames(activeGames) : undefined;
  const liveCount = sorted?.filter((g) => g.status.abstractGameState === 'Live').length ?? 0;

  const teamName = (team: { id: number; name: string }): string => {
    const tr = translations?.get(team.id);
    return tr?.shortName ?? tr?.nameZhTw ?? team.name;
  };

  /** 更新捲動箭頭可見性 */
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  /** 切換 tab 後重設捲動位置 */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollLeft = 0;
    }
    // 等 DOM 更新後再算捲動狀態
    requestAnimationFrame(updateScrollState);
  }, [activeTab, sorted, updateScrollState]);

  /** 監聽滾動事件 */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    updateScrollState();
    return () => el.removeEventListener('scroll', updateScrollState);
  }, [updateScrollState]);

  /** 左右捲動 */
  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = 320; // 約兩張卡片的寬度
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  /** 局數文字（例如「5局上」） */
  const inningText = (game: Game) => {
    if (game.status.abstractGameState !== 'Live' || !game.linescore?.currentInning) return '';
    const half = game.linescore.inningState;
    const halfCh =
      half === 'Top' || half === 'Middle' ? '上' : half === 'Bottom' || half === 'End' ? '下' : '';
    return `${game.linescore.currentInning}局${halfCh}`;
  };

  /** 渲染單張比賽卡片（橫幅版，高度精簡） */
  const renderGameCard = (game: Game) => {
    const isLive = game.status.abstractGameState === 'Live';
    const isFinal = game.status.abstractGameState === 'Final';
    const isPreview = game.status.abstractGameState === 'Preview';

    const awayScore = game.teams.away.score;
    const homeScore = game.teams.home.score;
    const awayWins = isFinal && awayScore! > homeScore!;
    const homeWins = isFinal && homeScore! > awayScore!;

    // LIVE 狀態：紅色邊框 + 脈衝動畫
    const borderCls = isLive
      ? 'border-2 border-red-400 shadow-[0_0_0_3px_rgba(248,113,113,0.2)] animate-pulse-border'
      : 'border border-gray-200';

    return (
      <Link
        key={game.gamePk}
        href={`/match/mlb/${game.gamePk}`}
        className={`flex-shrink-0 w-[148px] rounded-lg ${borderCls} bg-white px-2.5 py-1.5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all`}
      >
        {/* 狀態列 */}
        <div className="flex items-center justify-center mb-0.5 h-4">
          {isLive && (
            <span className="text-[10px] font-bold text-red-500 flex items-center gap-0.5 leading-none">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              <span>LIVE</span>
              {inningText(game) && <span className="text-red-400">· {inningText(game)}</span>}
            </span>
          )}
          {isFinal && <span className="text-[10px] font-medium text-gray-400 leading-none">已結束</span>}
          {isPreview && (
            <span className="text-[10px] text-gray-400 leading-none">{twTime(game.gameDate)}</span>
          )}
        </div>

        {/* 客隊 */}
        <div className="flex items-center justify-between gap-1 h-5">
          <div className="flex items-center gap-1 min-w-0">
            <img
              src={`https://www.mlbstatic.com/team-logos/${game.teams.away.team.id}.svg`}
              alt=""
              className="w-3.5 h-3.5 object-contain flex-shrink-0"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
            <span
              className={`text-[11px] truncate leading-none ${
                awayWins ? 'font-bold text-gray-900' : isLive ? 'text-gray-800' : 'text-gray-600'
              }`}
            >
              {teamName(game.teams.away.team)}
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
            <img
              src={`https://www.mlbstatic.com/team-logos/${game.teams.home.team.id}.svg`}
              alt=""
              className="w-3.5 h-3.5 object-contain flex-shrink-0"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
            <span
              className={`text-[11px] truncate leading-none ${
                homeWins ? 'font-bold text-gray-900' : isLive ? 'text-gray-800' : 'text-gray-600'
              }`}
            >
              {teamName(game.teams.home.team)}
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
      {/* 標題列 + 日期切換標籤 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">⚾</span>
          <h3 className="font-bold text-sm text-gray-800">MLB 比賽</h3>
          {/* 日期切換標籤 */}
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
          {/* LIVE 計數 */}
          {liveCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-red-500 font-bold ml-1">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              {liveCount} LIVE
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-400 hidden sm:inline">點卡片看詳細戰報</span>
      </div>

      {/* 橫向滾動區域 */}
      <div className="relative group">
        {/* 左箭頭 */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-0 z-10 w-7 flex items-center justify-center
              bg-gradient-to-r from-gray-100/90 to-transparent
              opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            aria-label="向左捲動"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* 右箭頭 */}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-0 z-10 w-7 flex items-center justify-center
              bg-gradient-to-l from-gray-100/90 to-transparent
              opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            aria-label="向右捲動"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* 比賽卡片橫向捲動容器 */}
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide pb-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {!sorted ? (
            <div className="flex items-center justify-center w-full h-[76px]">
              <p className="text-xs text-gray-400">載入中...</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex items-center justify-center w-full h-[76px]">
              <p className="text-xs text-gray-400">今日無賽事</p>
            </div>
          ) : (
            sorted.map(renderGameCard)
          )}
        </div>
      </div>
    </div>
  );
}
