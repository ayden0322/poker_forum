'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

/**
 * MLB 比賽 Widget — 以台灣日期為主（UTC+8）
 *
 * 三欄：昨日 / 今日 / 明日（全部以台灣當日為基準）
 * - 中間「今日」欄：含進行中比賽，每 10 秒刷新
 * - 排序：進行中 → 即將開打 → 已結束
 * - LIVE 比賽：紅色邊框 + 脈衝動畫
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

export function MLBGamesWidget() {
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

  const teamName = (team: { id: number; name: string }): string => {
    const tr = translations?.get(team.id);
    return tr?.shortName ?? tr?.nameZhTw ?? team.name;
  };

  const renderGameCard = (game: Game) => {
    const isLive = game.status.abstractGameState === 'Live';
    const isFinal = game.status.abstractGameState === 'Final';
    const isPreview = game.status.abstractGameState === 'Preview';

    const awayScore = game.teams.away.score;
    const homeScore = game.teams.home.score;
    const awayWins = isFinal && awayScore! > homeScore!;
    const homeWins = isFinal && homeScore! > awayScore!;

    // LIVE 狀態：邊框脈衝動畫
    const borderCls = isLive
      ? 'border-2 border-red-400 shadow-[0_0_0_3px_rgba(248,113,113,0.2)] animate-pulse-border'
      : 'border border-gray-200';

    // 局數文字（例如「5局上」）
    const inningText = () => {
      if (!isLive || !game.linescore?.currentInning) return '';
      const half = game.linescore.inningState;
      const halfCh =
        half === 'Top' || half === 'Middle' ? '上' : half === 'Bottom' || half === 'End' ? '下' : '';
      return `${game.linescore.currentInning}局${halfCh}`;
    };

    return (
      <Link
        key={game.gamePk}
        href={`/match/mlb/${game.gamePk}`}
        className={`block rounded-lg ${borderCls} bg-white p-2 shadow-sm hover:shadow-md hover:border-blue-300 transition-all`}
      >
        {/* 狀態列 */}
        <div className="flex items-center justify-center mb-1.5">
          {isLive && (
            <span className="text-[11px] font-bold text-red-500 flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span>⚡ 比賽進行中</span>
              {inningText() && <span className="text-red-400">· {inningText()}</span>}
            </span>
          )}
          {isFinal && <span className="text-[10px] font-medium text-gray-400">已結束</span>}
          {isPreview && (
            <span className="text-[10px] text-gray-400">
              {twTime(game.gameDate)} 開打
            </span>
          )}
        </div>

        {/* 客隊 */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <img
              src={`https://www.mlbstatic.com/team-logos/${game.teams.away.team.id}.svg`}
              alt=""
              className="w-4 h-4 object-contain"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
            <span
              className={`text-xs truncate ${
                awayWins ? 'font-bold text-gray-900' : isLive ? 'text-gray-800' : 'text-gray-600'
              }`}
            >
              {teamName(game.teams.away.team)}
            </span>
          </div>
          <span
            className={`text-sm tabular-nums ${
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

        <div className="border-t border-gray-100 my-1" />

        {/* 主隊 */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <img
              src={`https://www.mlbstatic.com/team-logos/${game.teams.home.team.id}.svg`}
              alt=""
              className="w-4 h-4 object-contain"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
            <span
              className={`text-xs truncate ${
                homeWins ? 'font-bold text-gray-900' : isLive ? 'text-gray-800' : 'text-gray-600'
              }`}
            >
              {teamName(game.teams.home.team)}
            </span>
          </div>
          <span
            className={`text-sm tabular-nums ${
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

  const renderColumn = (games: Game[] | undefined, title: string, isToday: boolean) => {
    const sorted = games ? sortGames(games) : undefined;
    const liveCount = sorted?.filter((g) => g.status.abstractGameState === 'Live').length ?? 0;

    return (
      <div
        className={`rounded-lg border ${
          isToday ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'
        } p-2`}
      >
        <div
          className={`text-xs font-bold ${isToday ? 'text-blue-700' : 'text-gray-500'} mb-2 text-center`}
        >
          {title}
          {sorted && sorted.length > 0 && (
            <span className="font-normal text-gray-400 ml-1">({sorted.length})</span>
          )}
          {liveCount > 0 && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-red-500 font-bold">
              · <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse inline-block" />
              {liveCount} 進行中
            </span>
          )}
        </div>
        {!sorted ? (
          <p className="text-xs text-gray-300 text-center py-4">載入中...</p>
        ) : sorted.length === 0 ? (
          <p className="text-xs text-gray-300 text-center py-4">無賽事</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">{sorted.map(renderGameCard)}</div>
        )}
      </div>
    );
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚾</span>
          <h3 className="font-bold text-gray-800">MLB 比賽（台灣時間）</h3>
        </div>
        <span className="text-xs text-gray-400">點卡片看詳細戰報</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {renderColumn(yesterday, `昨日 ${twDateLabel(-1)}`, false)}
        {renderColumn(today, `今日 ${twDateLabel(0)}`, true)}
        {renderColumn(tomorrow, `明日 ${twDateLabel(1)}`, false)}
      </div>
    </div>
  );
}
