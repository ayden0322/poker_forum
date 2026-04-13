'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

/** 看板 slug → API sport type 對應 */
const BOARD_SPORT_MAP: Record<string, { type: string; label: string }> = {
  baseball: { type: 'baseball', label: '棒球' },
  basketball: { type: 'basketball', label: '籃球' },
  soccer: { type: 'soccer', label: '足球' },
};

interface GameTeam {
  id: number;
  name: string;
  logo: string;
}

interface GameScore {
  home: number | null;
  away: number | null;
}

interface GameStatus {
  short: string;
  long: string;
}

/** 統一的賽事資料格式（前端正規化後） */
interface NormalizedGame {
  id: number;
  date: string;
  time: string;
  home: GameTeam;
  away: GameTeam;
  score: GameScore;
  status: GameStatus;
  league?: string;
}

interface ScoreWidgetProps {
  boardSlug: string;
}

export function ScoreWidget({ boardSlug }: ScoreWidgetProps) {
  const sportInfo = BOARD_SPORT_MAP[boardSlug];
  if (!sportInfo) return null;

  return <ScoreWidgetInner sportType={sportInfo.type} label={sportInfo.label} />;
}

function ScoreWidgetInner({ sportType, label }: { sportType: string; label: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sports-live', sportType],
    queryFn: () => apiFetch<{ data: unknown[] }>(`/sports/${sportType}/live`),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="mb-4 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 p-4">
        <div className="flex items-center gap-2 text-green-600 text-sm">
          <span className="animate-pulse">載入{label}賽事中...</span>
        </div>
      </div>
    );
  }

  if (isError) return null;

  const rawGames = data?.data ?? [];
  const games = normalizeGames(rawGames, sportType);

  if (games.length === 0) {
    return (
      <div className="mb-4 rounded-xl bg-gray-50 border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">⚾🏀⚽</span>
          <h3 className="font-bold text-gray-800">今日{label}賽事</h3>
        </div>
        <p className="text-sm text-gray-400">今日暫無賽事</p>
      </div>
    );
  }

  const sportIcon = sportType === 'baseball' ? '⚾' : sportType === 'basketball' ? '🏀' : '⚽';

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{sportIcon}</span>
          <h3 className="font-bold text-gray-800">今日{label}賽事</h3>
          <span className="text-xs text-gray-400">{games.length} 場</span>
        </div>
        <Link
          href={`/sports/${sportType}/stats`}
          className="text-xs text-blue-500 hover:text-blue-700"
        >
          更多數據 →
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </div>
  );
}

function GameCard({ game }: { game: NormalizedGame }) {
  const isLive = ['1H', '2H', 'Q1', 'Q2', 'Q3', 'Q4', 'HT', 'LIVE', 'IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'IN7', 'IN8', 'IN9'].includes(game.status.short);
  const isFinished = ['FT', 'AET', 'PEN', 'AOT'].includes(game.status.short);
  const isNotStarted = ['NS', 'TBD', 'PST'].includes(game.status.short);

  return (
    <div className="shrink-0 w-52 rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow">
      {/* 狀態標籤 */}
      <div className="flex items-center justify-between mb-2">
        {isLive && (
          <span className="text-xs font-bold text-red-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            LIVE
          </span>
        )}
        {isFinished && <span className="text-xs font-medium text-gray-500">已結束</span>}
        {isNotStarted && <span className="text-xs text-gray-400">{game.time}</span>}
        {!isLive && !isFinished && !isNotStarted && (
          <span className="text-xs text-gray-400">{game.status.short}</span>
        )}
        {game.league && <span className="text-xs text-gray-300">{game.league}</span>}
      </div>

      {/* 客隊 */}
      <TeamRow
        team={game.away}
        score={game.score.away}
        isWinner={isFinished && game.score.away !== null && game.score.home !== null && game.score.away > game.score.home}
      />

      {/* 分隔線 */}
      <div className="border-t border-gray-100 my-1.5" />

      {/* 主隊 */}
      <TeamRow
        team={game.home}
        score={game.score.home}
        isWinner={isFinished && game.score.home !== null && game.score.away !== null && game.score.home > game.score.away}
      />
    </div>
  );
}

function TeamRow({ team, score, isWinner }: { team: GameTeam; score: number | null; isWinner: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {team.logo && (
          <img src={team.logo} alt={team.name} className="w-5 h-5 object-contain" />
        )}
        <span className={`text-sm truncate ${isWinner ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
          {team.name}
        </span>
      </div>
      <span className={`text-sm tabular-nums ${isWinner ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
        {score ?? '-'}
      </span>
    </div>
  );
}

/** 將 API-Sports 不同運動的回傳格式正規化 */
function normalizeGames(raw: unknown[], sportType: string): NormalizedGame[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item: any) => {
    if (sportType === 'soccer') {
      return {
        id: item.fixture?.id ?? 0,
        date: item.fixture?.date?.slice(0, 10) ?? '',
        time: formatTime(item.fixture?.date),
        home: {
          id: item.teams?.home?.id ?? 0,
          name: item.teams?.home?.name ?? '未知',
          logo: item.teams?.home?.logo ?? '',
        },
        away: {
          id: item.teams?.away?.id ?? 0,
          name: item.teams?.away?.name ?? '未知',
          logo: item.teams?.away?.logo ?? '',
        },
        score: {
          home: item.goals?.home ?? null,
          away: item.goals?.away ?? null,
        },
        status: {
          short: item.fixture?.status?.short ?? 'NS',
          long: item.fixture?.status?.long ?? '',
        },
        league: item.league?.name,
      };
    }

    // basketball & baseball 格式相近
    return {
      id: item.id ?? 0,
      date: item.date?.slice(0, 10) ?? '',
      time: formatTime(item.date ?? item.time),
      home: {
        id: item.teams?.home?.id ?? 0,
        name: item.teams?.home?.name ?? '未知',
        logo: item.teams?.home?.logo ?? '',
      },
      away: {
        id: item.teams?.away?.id ?? 0,
        name: item.teams?.away?.name ?? '未知',
        logo: item.teams?.away?.logo ?? '',
      },
      score: {
        home: item.scores?.home?.total ?? null,
        away: item.scores?.away?.total ?? null,
      },
      status: {
        short: item.status?.short ?? 'NS',
        long: item.status?.long ?? '',
      },
      league: item.league?.name,
    };
  }).filter((g: NormalizedGame) => g.id !== 0);
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}
