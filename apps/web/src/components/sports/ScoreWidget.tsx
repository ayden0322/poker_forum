'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

/**
 * Board slug → 運動資訊對應
 * 有在這裡的 slug 才會顯示 ScoreWidget
 */
const BOARD_SPORT_MAP: Record<string, { sportType: string; label: string; icon: string }> = {
  // 籃球
  nba:                { sportType: 'basketball', label: 'NBA',      icon: '🏀' },
  cba:                { sportType: 'basketball', label: 'CBA',      icon: '🏀' },
  't1-league':        { sportType: 'basketball', label: 'T1 聯盟',  icon: '🏀' },
  tpbl:               { sportType: 'basketball', label: 'TPBL',     icon: '🏀' },
  'b-league':         { sportType: 'basketball', label: 'B.League', icon: '🏀' },
  kbl:                { sportType: 'basketball', label: 'KBL',      icon: '🏀' },
  euroleague:         { sportType: 'basketball', label: '歐洲籃球',  icon: '🏀' },
  // 足球
  epl:                { sportType: 'football',   label: '英超',  icon: '⚽' },
  'la-liga':          { sportType: 'football',   label: '西甲',  icon: '⚽' },
  'serie-a':          { sportType: 'football',   label: '義甲',  icon: '⚽' },
  bundesliga:         { sportType: 'football',   label: '德甲',  icon: '⚽' },
  'ligue-1':          { sportType: 'football',   label: '法甲',  icon: '⚽' },
  ucl:                { sportType: 'football',   label: '歐冠',  icon: '⚽' },
  'j-league':         { sportType: 'football',   label: 'J 聯賽', icon: '⚽' },
  csl:                { sportType: 'football',   label: '中超',  icon: '⚽' },
  'world-cup':        { sportType: 'football',   label: '世界盃', icon: '⚽' },
  // 棒球
  mlb:                { sportType: 'baseball',   label: 'MLB',      icon: '⚾' },
  cpbl:               { sportType: 'baseball',   label: '中華職棒',  icon: '⚾' },
  npb:                { sportType: 'baseball',   label: '日本職棒',  icon: '⚾' },
  kbo:                { sportType: 'baseball',   label: '韓國職棒',  icon: '⚾' },
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

interface RecentGamesResponse {
  data: {
    yesterday: unknown[];
    today: unknown[];
    tomorrow: unknown[];
  };
}

interface ScoreWidgetProps {
  boardSlug: string;
}

export function ScoreWidget({ boardSlug }: ScoreWidgetProps) {
  const sportInfo = BOARD_SPORT_MAP[boardSlug];
  if (!sportInfo) return null;

  return <ScoreWidgetInner boardSlug={boardSlug} sportType={sportInfo.sportType} label={sportInfo.label} icon={sportInfo.icon} />;
}

/** 格式化日期為 MM/DD */
function formatDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 哪些 board 的比賽可以點進去看詳情 */
const DETAIL_SUPPORTED: Record<string, (id: number) => string> = {
  mlb: (gamePk) => `/match/mlb/${gamePk}`,
};

function ScoreWidgetInner({ boardSlug, sportType, label, icon }: { boardSlug: string; sportType: string; label: string; icon: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sports-recent', boardSlug],
    queryFn: () => apiFetch<RecentGamesResponse>(`/sports/${boardSlug}/recent`),
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

  const yesterday = normalizeGames(data?.data.yesterday ?? [], sportType);
  const today = normalizeGames(data?.data.today ?? [], sportType);
  const tomorrow = normalizeGames(data?.data.tomorrow ?? [], sportType);

  const hasAnyGames = yesterday.length > 0 || today.length > 0 || tomorrow.length > 0;

  if (!hasAnyGames) {
    return (
      <div className="mb-4 rounded-xl bg-gray-50 border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{icon}</span>
          <h3 className="font-bold text-gray-800">{label} 賽事</h3>
        </div>
        <p className="text-sm text-gray-400">近三日暫無賽事</p>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h3 className="font-bold text-gray-800">{label} 賽事</h3>
        </div>
        <Link
          href={`/sports/${boardSlug}/stats`}
          className="text-xs text-blue-500 hover:text-blue-700"
        >
          更多數據 →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* 昨日賽果 */}
        <DayColumn
          title={`昨日 ${formatDate(-1)}`}
          games={yesterday}
          emptyText="無賽事"
          bgClass="bg-gray-50"
          titleClass="text-gray-500"
        />

        {/* 今日賽事 */}
        <DayColumn
          title={`今日 ${formatDate(0)}`}
          games={today}
          emptyText="無賽事"
          bgClass="bg-blue-50"
          titleClass="text-blue-600"
          isToday
        />

        {/* 明日賽程 */}
        <DayColumn
          title={`明日 ${formatDate(1)}`}
          games={tomorrow}
          emptyText="無賽事"
          bgClass="bg-gray-50"
          titleClass="text-gray-500"
        />
      </div>
    </div>
  );
}

function DayColumn({ title, games, emptyText, bgClass, titleClass, isToday }: {
  title: string;
  games: NormalizedGame[];
  emptyText: string;
  bgClass: string;
  titleClass: string;
  isToday?: boolean;
}) {
  return (
    <div className={`rounded-lg border ${isToday ? 'border-blue-200' : 'border-gray-200'} ${bgClass} p-2`}>
      <div className={`text-xs font-bold ${titleClass} mb-2 text-center`}>
        {title}
        {games.length > 0 && <span className="font-normal text-gray-400 ml-1">({games.length})</span>}
      </div>
      {games.length === 0 ? (
        <p className="text-xs text-gray-300 text-center py-4">{emptyText}</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {games.map((game) => (
            <GameCard key={game.id} game={game} compact />
          ))}
        </div>
      )}
    </div>
  );
}

function GameCard({ game, compact }: { game: NormalizedGame; compact?: boolean }) {
  const isLive = ['1H', '2H', 'Q1', 'Q2', 'Q3', 'Q4', 'HT', 'LIVE', 'IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'IN7', 'IN8', 'IN9'].includes(game.status.short);
  const isFinished = ['FT', 'AET', 'PEN', 'AOT'].includes(game.status.short);
  const isNotStarted = ['NS', 'TBD', 'PST'].includes(game.status.short);

  return (
    <div className={`rounded-lg border border-gray-200 bg-white ${compact ? 'p-2' : 'p-3'} shadow-sm`}>
      {/* 狀態 */}
      <div className="flex items-center justify-center mb-1.5">
        {isLive && (
          <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            LIVE
          </span>
        )}
        {isFinished && <span className="text-[10px] font-medium text-gray-400">已結束</span>}
        {isNotStarted && <span className="text-[10px] text-gray-400">{game.time}</span>}
        {!isLive && !isFinished && !isNotStarted && (
          <span className="text-[10px] text-gray-400">{game.status.short}</span>
        )}
      </div>

      {/* 客隊 */}
      <TeamRow
        team={game.away}
        score={game.score.away}
        isWinner={isFinished && game.score.away !== null && game.score.home !== null && game.score.away > game.score.home}
        compact={compact}
      />

      <div className="border-t border-gray-100 my-1" />

      {/* 主隊 */}
      <TeamRow
        team={game.home}
        score={game.score.home}
        isWinner={isFinished && game.score.home !== null && game.score.away !== null && game.score.home > game.score.away}
        compact={compact}
      />
    </div>
  );
}

function TeamRow({ team, score, isWinner, compact }: { team: GameTeam; score: number | null; isWinner: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-1">
      <div className="flex items-center gap-1.5 min-w-0">
        {team.logo && (
          <img src={team.logo} alt={team.name} className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} object-contain`} />
        )}
        <span className={`${compact ? 'text-xs' : 'text-sm'} truncate ${isWinner ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
          {team.name}
        </span>
      </div>
      <span className={`${compact ? 'text-xs' : 'text-sm'} tabular-nums ${isWinner ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
        {score ?? '-'}
      </span>
    </div>
  );
}

/** 將 API-Sports 不同運動的回傳格式正規化 */
function normalizeGames(raw: unknown[], sportType: string): NormalizedGame[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item: any) => {
    if (sportType === 'football') {
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
          short: String(item.fixture?.status?.short ?? 'NS'),
          long: item.fixture?.status?.long ?? '',
        },
        league: item.league?.name,
      };
    }

    if (sportType === 'basketball') {
      return {
        id: item.id ?? 0,
        date: item.date?.slice(0, 10) ?? '',
        time: formatTime(item.date),
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
          short: String(item.status?.short ?? 'NS'),
          long: item.status?.long ?? '',
        },
        league: item.league?.name,
      };
    }

    // Baseball
    return {
      id: item.id ?? 0,
      date: item.date?.slice(0, 10) ?? '',
      time: formatTime(item.date),
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
        short: String(item.status?.short ?? 'NS'),
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
