'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import CpblBoxScore from '@/components/sports/CpblBoxScore';
import { BaseballHeadToHeadBlock } from '@/components/sports/BaseballHeadToHeadBlock';

const LEAGUE_NAMES: Record<string, string> = {
  cpbl: '中華職棒',
  npb: '日本職棒',
  kbo: '韓國職棒',
};

const LEAGUE_COLORS: Record<string, { from: string; to: string }> = {
  cpbl: { from: 'from-red-700', to: 'to-red-900' },
  npb: { from: 'from-indigo-700', to: 'to-indigo-900' },
  kbo: { from: 'from-emerald-700', to: 'to-emerald-900' },
};

interface BaseballTeam {
  id: number;
  name: string;
  nameZhTw?: string | null;
  shortName?: string | null;
  logo: string;
}

interface GameData {
  id: number;
  date: string;
  time: string;
  timestamp: number;
  timezone: string;
  status: { long: string; short: string };
  league: { id: number; name: string; country: string; logo: string; season: number };
  teams: {
    home: BaseballTeam;
    away: BaseballTeam;
  };
  scores: {
    home: { hits: number | null; errors: number | null; innings: Record<string, number | null>; total: number | null };
    away: { hits: number | null; errors: number | null; innings: Record<string, number | null>; total: number | null };
  };
}

/** 球隊顯示名（優先：短名 → 中文 → 英文） */
function teamDisplay(t: BaseballTeam): string {
  return t.shortName ?? t.nameZhTw ?? t.name;
}

/** 台灣時間格式化 */
function twTime(timestamp: number): string {
  try {
    return new Date(timestamp * 1000).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

/** 逐局比分表（API-Sports 格式） */
function InningsTable({ game }: { game: GameData }) {
  const awayInnings = game.scores?.away?.innings ?? {};
  const homeInnings = game.scores?.home?.innings ?? {};

  // 取得所有局數 key
  const allKeys = new Set([...Object.keys(awayInnings), ...Object.keys(homeInnings)]);
  const numInnings = Math.max(9, allKeys.size);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="font-bold text-gray-800">逐局比分</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 bg-gray-50 border-b border-gray-100">
              <th className="text-left px-3 py-2 font-medium">球隊</th>
              {Array.from({ length: numInnings }, (_, i) => (
                <th key={i} className="text-center px-2 py-2 font-medium tabular-nums w-10">
                  {i + 1}
                </th>
              ))}
              <th className="text-center px-3 py-2 font-bold text-gray-700 bg-gray-100">R</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">H</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">E</th>
            </tr>
          </thead>
          <tbody>
            {/* 客隊 */}
            <tr className="border-b border-gray-100">
              <td className="px-3 py-2 font-medium">{teamDisplay(game.teams.away)}</td>
              {Array.from({ length: numInnings }, (_, i) => (
                <td key={i} className="text-center px-2 py-2 tabular-nums">
                  {awayInnings[String(i + 1)] ?? '-'}
                </td>
              ))}
              <td className="text-center px-3 py-2 font-bold text-blue-600 tabular-nums bg-gray-50">
                {game.scores.away.total ?? '-'}
              </td>
              <td className="text-center px-3 py-2 tabular-nums text-gray-600">
                {game.scores.away.hits ?? '-'}
              </td>
              <td className="text-center px-3 py-2 tabular-nums text-gray-600">
                {game.scores.away.errors ?? '-'}
              </td>
            </tr>
            {/* 主隊 */}
            <tr>
              <td className="px-3 py-2 font-medium">{teamDisplay(game.teams.home)}</td>
              {Array.from({ length: numInnings }, (_, i) => (
                <td key={i} className="text-center px-2 py-2 tabular-nums">
                  {homeInnings[String(i + 1)] ?? '-'}
                </td>
              ))}
              <td className="text-center px-3 py-2 font-bold text-blue-600 tabular-nums bg-gray-50">
                {game.scores.home.total ?? '-'}
              </td>
              <td className="text-center px-3 py-2 tabular-nums text-gray-600">
                {game.scores.home.hits ?? '-'}
              </td>
              <td className="text-center px-3 py-2 tabular-nums text-gray-600">
                {game.scores.home.errors ?? '-'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MatchPageClient({ league, gameId }: { league: string; gameId: number }) {
  const leagueName = LEAGUE_NAMES[league] ?? league.toUpperCase();
  const colors = LEAGUE_COLORS[league] ?? { from: 'from-gray-700', to: 'to-gray-900' };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['baseball-game', league, gameId],
    queryFn: () => apiFetch<{ data: GameData }>(`/baseball/${league}/games/${gameId}`),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <span className="animate-pulse text-gray-400">載入比賽資料中...</span>
      </div>
    );
  }

  if (isError || !data?.data) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20 text-gray-400">
        找不到此場比賽資料
      </div>
    );
  }

  const game = data.data;
  const awayScore = game.scores?.away?.total ?? 0;
  const homeScore = game.scores?.home?.total ?? 0;
  const isFinished = ['FT', 'AOT'].includes(game.status.short);
  const isLive = !isFinished && !['NS', 'TBD', 'PST', 'CANC', 'SUSP'].includes(game.status.short);
  const hasInnings = game.scores?.away?.innings && Object.keys(game.scores.away.innings).length > 0;

  return (
    <div className="max-w-4xl mx-auto">
      {/* 麵包屑 */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        <Link href="/" className="hover:text-blue-600">首頁</Link>
        <span>/</span>
        <Link href={`/board/${league}`} className="hover:text-blue-600">{leagueName}</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">比賽詳情</span>
      </nav>

      {/* 比分頭卡 */}
      <div className={`bg-gradient-to-r ${colors.from} ${colors.to} text-white rounded-2xl p-6 mb-4 shadow-lg`}>
        {/* LIVE 提示 */}
        {isLive && (
          <div className="text-center mb-3">
            <span className="inline-flex items-center gap-1.5 bg-red-500/80 text-white text-xs font-bold px-3 py-1 rounded-full">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              比賽進行中 · {game.status.long}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          {/* 客隊 */}
          <Link
            href={`/team/baseball/${league}/${game.teams.away.id}`}
            className="flex-1 text-center group hover:opacity-90 transition-opacity"
          >
            <img
              src={game.teams.away.logo}
              alt={game.teams.away.name}
              className="w-16 h-16 mx-auto mb-2 object-contain"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
            <div className="text-xs opacity-70">客隊</div>
            <div className="font-bold text-lg group-hover:underline">{teamDisplay(game.teams.away)}</div>
            <div className={`text-5xl font-black tabular-nums mt-2 ${awayScore > homeScore ? '' : 'opacity-50'}`}>
              {awayScore}
            </div>
          </Link>

          {/* 中間狀態 */}
          <div className="text-center px-4">
            <div className="text-xs opacity-70 mb-1">
              {isFinished ? '已結束' : isLive ? game.status.long : ''}
            </div>
            <div className="text-2xl opacity-50 my-2">VS</div>
            <div className="text-xs opacity-70">
              {game.timestamp ? twTime(game.timestamp) : game.date}
            </div>
          </div>

          {/* 主隊 */}
          <Link
            href={`/team/baseball/${league}/${game.teams.home.id}`}
            className="flex-1 text-center group hover:opacity-90 transition-opacity"
          >
            <img
              src={game.teams.home.logo}
              alt={game.teams.home.name}
              className="w-16 h-16 mx-auto mb-2 object-contain"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
            <div className="text-xs opacity-70">主隊</div>
            <div className="font-bold text-lg group-hover:underline">{teamDisplay(game.teams.home)}</div>
            <div className={`text-5xl font-black tabular-nums mt-2 ${homeScore > awayScore ? '' : 'opacity-50'}`}>
              {homeScore}
            </div>
          </Link>
        </div>
      </div>

      {/* 逐局比分（只有已開始的比賽才顯示） */}
      {hasInnings && <InningsTable game={game} />}

      {/* 比賽未開始的提示 */}
      {game.status.short === 'NS' && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center mb-4">
          <div className="text-4xl mb-3">⚾</div>
          <h3 className="font-bold text-gray-800 mb-1">比賽尚未開始</h3>
          <p className="text-sm text-gray-500">
            預定開賽時間：{game.timestamp ? twTime(game.timestamp) : game.time}（台灣時間）
          </p>
        </div>
      )}

      {/* 已結束的比賽摘要 */}
      {isFinished && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <h3 className="font-bold text-gray-800 mb-3">比賽結果</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="text-gray-500">勝方</span>
              <div className="font-bold text-lg mt-1">
                {awayScore > homeScore ? teamDisplay(game.teams.away) : teamDisplay(game.teams.home)}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="text-gray-500">最終比分</span>
              <div className="font-bold text-lg mt-1 tabular-nums">
                {awayScore} - {homeScore}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 歷史對戰（所有非 MLB 棒球聯賽） */}
      {game.teams.home.id && game.teams.away.id && (
        <BaseballHeadToHeadBlock
          league={league}
          teamId={game.teams.away.id}
          opponentId={game.teams.home.id}
          teamName={teamDisplay(game.teams.away)}
          opponentName={teamDisplay(game.teams.home)}
          limit={10}
        />
      )}

      {/* CPBL 官方 Box Score（僅 CPBL 聯賽顯示） */}
      {league === 'cpbl' && <CpblBoxScoreSection game={game} />}

      <div className="text-xs text-gray-400 text-center mt-6 pb-4">
        資料來源：API-Sports · {leagueName}
        {league === 'cpbl' && ' + CPBL 中華職棒大聯盟官方網站'}
      </div>
    </div>
  );
}

/**
 * CPBL 官方 Box Score 區塊
 * 自動從 CPBL 官方賽程中找到對應的 GameSno，然後載入 Box Score
 */
function CpblBoxScoreSection({ game }: { game: GameData }) {
  // 從比賽日期計算月份，查 CPBL 官方賽程
  const gameDate = game.date; // YYYY-MM-DD
  const [yearStr, monthStr] = gameDate?.split('-') ?? [];
  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
  const month = monthStr ? parseInt(monthStr, 10) : new Date().getMonth() + 1;

  const { data: scheduleData } = useQuery({
    queryKey: ['cpbl-schedule-match', year, month],
    queryFn: () =>
      apiFetch<{ success: boolean; data: CpblScheduleGame[] }>(`/cpbl/schedule?year=${year}&month=${month}`),
    staleTime: 5 * 60 * 1000,
    enabled: !!gameDate,
  });

  // 嘗試配對：用比賽日期 + 球隊名稱模糊匹配
  const gameSno = findMatchingGameSno(scheduleData?.data ?? [], game);

  if (!gameSno) {
    return null; // 找不到對應的 CPBL GameSno，不顯示
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-6 bg-red-600 rounded-full" />
        <h2 className="text-lg font-bold text-gray-800">CPBL 官方 Box Score</h2>
        <Link
          href={`/match/baseball/cpbl/box/${gameSno}`}
          className="text-xs text-blue-500 hover:text-blue-700 ml-auto"
        >
          獨立頁面 →
        </Link>
      </div>
      <CpblBoxScore gameSno={gameSno} year={year} />
    </div>
  );
}

interface CpblScheduleGame {
  gameSno: number | null;
  date: string | null;
  homeTeam: string;
  awayTeam: string;
  status: string | null;
}

/** 根據比賽日期和球隊名稱模糊匹配找到 CPBL GameSno */
function findMatchingGameSno(schedule: CpblScheduleGame[], game: GameData): number | null {
  if (!schedule || schedule.length === 0) return null;

  const gameDate = game.date; // YYYY-MM-DD
  const awayName = game.teams?.away?.name ?? '';
  const homeName = game.teams?.home?.name ?? '';

  // 在 CPBL 賽程中找到同日期且球隊名稱匹配的比賽
  for (const sg of schedule) {
    if (!sg.gameSno || !sg.date) continue;

    // 日期需匹配
    if (sg.date !== gameDate) continue;

    // 球隊名稱模糊匹配（API-Sports 用英文名，CPBL 用中文名）
    // 策略：檢查是否有任何名稱包含/被包含的關係
    const cpblHome = sg.homeTeam ?? '';
    const cpblAway = sg.awayTeam ?? '';

    // 如果只有一場當天的比賽，直接配對
    const sameDayGames = schedule.filter((s) => s.date === gameDate && s.gameSno);
    if (sameDayGames.length === 1) {
      return sg.gameSno;
    }

    // 多場比賽時用名稱匹配（需要翻譯表或 fuzzy match）
    // CPBL 球隊英文名 → 中文名的對應
    const teamNameMap: Record<string, string[]> = {
      'CTBC Brothers': ['中信兄弟', '兄弟'],
      'Uni-President Lions': ['統一獅', '統一7-ELEVEn獅'],
      'Rakuten Monkeys': ['樂天桃猿', '桃猿'],
      'Fubon Guardians': ['富邦悍將', '悍將'],
      'Wei Chuan Dragons': ['味全龍', '龍'],
      'TSG Hawks': ['台鋼雄鷹', '雄鷹'],
    };

    const matchTeam = (apiSportsName: string, cpblName: string): boolean => {
      // 直接比對
      if (apiSportsName === cpblName) return true;
      // 透過對照表
      const aliases = teamNameMap[apiSportsName];
      if (aliases) {
        return aliases.some((a) => cpblName.includes(a) || a.includes(cpblName));
      }
      // 反向查找
      for (const [eng, zhArr] of Object.entries(teamNameMap)) {
        if (zhArr.some((z) => cpblName.includes(z))) {
          if (apiSportsName.includes(eng) || eng.includes(apiSportsName)) return true;
        }
      }
      return false;
    };

    if (
      (matchTeam(homeName, cpblHome) && matchTeam(awayName, cpblAway)) ||
      (matchTeam(homeName, cpblAway) && matchTeam(awayName, cpblHome))
    ) {
      return sg.gameSno;
    }
  }

  return null;
}
