'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

/**
 * MLB 專屬比賽牆（資料來自 MLB 官方，包含 gamePk 可連到詳情頁）
 */

interface Game {
  gamePk: number;
  officialDate: string;
  gameDate: string;
  status: {
    abstractGameState: string;
    detailedState: string;
    statusCode: string;
  };
  teams: {
    away: { team: { id: number; name: string }; score?: number };
    home: { team: { id: number; name: string }; score?: number };
  };
  linescore?: {
    currentInning?: number;
    inningState?: string;
  };
}

interface TeamTranslation {
  mlbStatsTeamId: number;
  nameZhTw: string;
  shortName?: string;
}

function formatDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

/** 呼叫後端取得某日 MLB 賽程（會從 MLB 官方來） */
async function fetchGames(date: string): Promise<Game[]> {
  const res = await apiFetch<{ data: Game[] }>(`/mlb/schedule?date=${date}`);
  return res.data ?? [];
}

/** 呼叫後端取得球隊翻譯 */
async function fetchTeamTranslations(): Promise<Map<number, TeamTranslation>> {
  const res = await apiFetch<{ data: Array<{ id: number; nameZhTw: string; shortName?: string }> }>(
    '/mlb/teams',
  );
  return new Map(res.data.map((t) => [t.id, { mlbStatsTeamId: t.id, nameZhTw: t.nameZhTw, shortName: t.shortName }]));
}

export function MLBGamesWidget() {
  const { data: translations } = useQuery({
    queryKey: ['mlb-team-translations'],
    queryFn: fetchTeamTranslations,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { data: yesterday } = useQuery({
    queryKey: ['mlb-schedule', formatDate(-1)],
    queryFn: () => fetchGames(formatDate(-1)),
    staleTime: 10 * 60 * 1000,
  });

  const { data: today } = useQuery({
    queryKey: ['mlb-schedule', formatDate(0)],
    queryFn: () => fetchGames(formatDate(0)),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  const { data: tomorrow } = useQuery({
    queryKey: ['mlb-schedule', formatDate(1)],
    queryFn: () => fetchGames(formatDate(1)),
    staleTime: 10 * 60 * 1000,
  });

  const teamName = (team: { id: number; name: string }): string => {
    const tr = translations?.get(team.id);
    return tr?.shortName ?? tr?.nameZhTw ?? team.name;
  };

  const renderGameCard = (game: Game) => {
    const status = game.status.detailedState;
    const isLive = game.status.abstractGameState === 'Live';
    const isFinal = game.status.abstractGameState === 'Final';
    const isPreview = game.status.abstractGameState === 'Preview';

    const awayScore = game.teams.away.score;
    const homeScore = game.teams.home.score;
    const awayWins = isFinal && awayScore! > homeScore!;
    const homeWins = isFinal && homeScore! > awayScore!;

    return (
      <Link
        key={game.gamePk}
        href={`/match/mlb/${game.gamePk}`}
        className="block rounded-lg border border-gray-200 bg-white p-2 shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
      >
        <div className="flex items-center justify-center mb-1.5">
          {isLive && (
            <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              {game.linescore?.inningState === 'Top' ? '↑' : '↓'}
              {game.linescore?.currentInning ?? ''}局
            </span>
          )}
          {isFinal && <span className="text-[10px] font-medium text-gray-400">已結束</span>}
          {isPreview && <span className="text-[10px] text-gray-400">{formatTime(game.gameDate)}</span>}
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
            <span className={`text-xs truncate ${awayWins ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
              {teamName(game.teams.away.team)}
            </span>
          </div>
          <span className={`text-xs tabular-nums ${awayWins ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
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
            <span className={`text-xs truncate ${homeWins ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
              {teamName(game.teams.home.team)}
            </span>
          </div>
          <span className={`text-xs tabular-nums ${homeWins ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
            {homeScore ?? '-'}
          </span>
        </div>
      </Link>
    );
  };

  const renderColumn = (games: Game[] | undefined, title: string, isToday: boolean) => (
    <div
      className={`rounded-lg border ${isToday ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'} p-2`}
    >
      <div className={`text-xs font-bold ${isToday ? 'text-blue-600' : 'text-gray-500'} mb-2 text-center`}>
        {title}
        {games && games.length > 0 && (
          <span className="font-normal text-gray-400 ml-1">({games.length})</span>
        )}
      </div>
      {!games ? (
        <p className="text-xs text-gray-300 text-center py-4">載入中...</p>
      ) : games.length === 0 ? (
        <p className="text-xs text-gray-300 text-center py-4">無賽事</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">{games.map(renderGameCard)}</div>
      )}
    </div>
  );

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚾</span>
          <h3 className="font-bold text-gray-800">MLB 比賽</h3>
        </div>
        <span className="text-xs text-gray-400">點擊查看詳細戰報</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {renderColumn(yesterday, `昨日 ${formatDateLabel(-1)}`, false)}
        {renderColumn(today, `今日 ${formatDateLabel(0)}`, true)}
        {renderColumn(tomorrow, `明日 ${formatDateLabel(1)}`, false)}
      </div>
    </div>
  );
}
