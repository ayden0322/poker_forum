'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

interface Response {
  data: {
    game: any;
    linescore: any;
    boxscore: any;
  };
}

/** 取得球員顯示名（優先中文簡稱 > 中文全名 > 英文） */
function playerName(person: any): string {
  if (!person) return '未知';
  return person.shortName ?? person.nameZhTw ?? person.fullName ?? '未知';
}

/** 取得球隊顯示名 */
function teamName(team: any): string {
  if (!team) return '';
  return team.shortName ?? team.nameZhTw ?? team.name ?? '';
}

/** 格式化數字（小數點對齊） */
function fmt(n: any, digits = 0): string {
  if (n === null || n === undefined || n === '') return '-';
  const num = typeof n === 'number' ? n : parseFloat(n);
  if (isNaN(num)) return String(n);
  return digits > 0 ? num.toFixed(digits) : String(num);
}

/** 逐局比分表 */
function LineScoreTable({ linescore, boxscore }: { linescore: any; boxscore: any }) {
  const innings = linescore?.innings ?? [];
  const awayTotal = linescore?.teams?.away ?? {};
  const homeTotal = linescore?.teams?.home ?? {};
  const awayTeam = boxscore?.teams?.away?.team;
  const homeTeam = boxscore?.teams?.home?.team;

  // 至少顯示 9 局
  const displayInnings = Math.max(9, innings.length);

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
              {Array.from({ length: displayInnings }, (_, i) => (
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
            <tr className="border-b border-gray-100">
              <td className="px-3 py-2 font-medium">{teamName(awayTeam)}</td>
              {Array.from({ length: displayInnings }, (_, i) => {
                const inning = innings.find((x: any) => x.num === i + 1);
                const runs = inning?.away?.runs;
                return (
                  <td key={i} className="text-center px-2 py-2 tabular-nums">
                    {runs !== undefined && runs !== null ? runs : '-'}
                  </td>
                );
              })}
              <td className="text-center px-3 py-2 font-bold text-blue-600 tabular-nums bg-gray-50">
                {awayTotal.runs ?? '-'}
              </td>
              <td className="text-center px-3 py-2 tabular-nums text-gray-600">{awayTotal.hits ?? '-'}</td>
              <td className="text-center px-3 py-2 tabular-nums text-gray-600">{awayTotal.errors ?? '-'}</td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-medium">{teamName(homeTeam)}</td>
              {Array.from({ length: displayInnings }, (_, i) => {
                const inning = innings.find((x: any) => x.num === i + 1);
                const runs = inning?.home?.runs;
                return (
                  <td key={i} className="text-center px-2 py-2 tabular-nums">
                    {runs !== undefined && runs !== null ? runs : '-'}
                  </td>
                );
              })}
              <td className="text-center px-3 py-2 font-bold text-blue-600 tabular-nums bg-gray-50">
                {homeTotal.runs ?? '-'}
              </td>
              <td className="text-center px-3 py-2 tabular-nums text-gray-600">{homeTotal.hits ?? '-'}</td>
              <td className="text-center px-3 py-2 tabular-nums text-gray-600">{homeTotal.errors ?? '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 打者成績表 */
function BattingTable({ teamData, teamLabel }: { teamData: any; teamLabel: string }) {
  const players = teamData?.players ?? {};
  const order: string[] = teamData?.battingOrder ?? [];

  // 先依照打序排，沒上場的排後面
  const playerArr = Object.values(players) as any[];
  const inOrder = order.map((id) => playerArr.find((p) => p.person.id === parseInt(id))).filter(Boolean);
  const subs = playerArr.filter((p) => !order.includes(String(p.person.id)) && p.stats?.batting?.atBats > 0);
  const batters = [...inOrder, ...subs];

  if (batters.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-gray-100 bg-blue-50">
        <h3 className="font-bold text-gray-800">{teamLabel} 打擊</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 bg-gray-50 border-b border-gray-100 text-xs">
              <th className="text-left px-3 py-2 font-medium">球員</th>
              <th className="text-center px-2 py-2 font-medium">位置</th>
              <th className="text-center px-2 py-2 font-medium tabular-nums">AB</th>
              <th className="text-center px-2 py-2 font-medium tabular-nums">R</th>
              <th className="text-center px-2 py-2 font-medium tabular-nums">H</th>
              <th className="text-center px-2 py-2 font-medium tabular-nums">HR</th>
              <th className="text-center px-2 py-2 font-medium tabular-nums">RBI</th>
              <th className="text-center px-2 py-2 font-medium tabular-nums">BB</th>
              <th className="text-center px-2 py-2 font-medium tabular-nums">SO</th>
              <th className="text-center px-2 py-2 font-medium tabular-nums">AVG</th>
            </tr>
          </thead>
          <tbody>
            {batters.map((p: any) => {
              const b = p.stats?.batting ?? {};
              const season = p.seasonStats?.batting ?? {};
              return (
                <tr key={p.person.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link href={`/player/mlb/${p.person.id}`} className="text-blue-600 hover:underline">
                      {playerName(p.person)}
                    </Link>
                  </td>
                  <td className="text-center px-2 py-2 text-gray-500 text-xs">{p.position?.abbreviation ?? '-'}</td>
                  <td className="text-center px-2 py-2 tabular-nums">{b.atBats ?? 0}</td>
                  <td className="text-center px-2 py-2 tabular-nums">{b.runs ?? 0}</td>
                  <td className="text-center px-2 py-2 tabular-nums font-medium">{b.hits ?? 0}</td>
                  <td className="text-center px-2 py-2 tabular-nums">
                    {b.homeRuns > 0 ? <span className="text-red-500 font-bold">{b.homeRuns}</span> : 0}
                  </td>
                  <td className="text-center px-2 py-2 tabular-nums">{b.rbi ?? 0}</td>
                  <td className="text-center px-2 py-2 tabular-nums">{b.baseOnBalls ?? 0}</td>
                  <td className="text-center px-2 py-2 tabular-nums">{b.strikeOuts ?? 0}</td>
                  <td className="text-center px-2 py-2 tabular-nums text-gray-500 text-xs">{season.avg ?? '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 投手成績表 */
function PitchingTable({ teamData, teamLabel }: { teamData: any; teamLabel: string }) {
  const players = teamData?.players ?? {};
  const pitcherIds: string[] = teamData?.pitchers ?? [];

  const pitchers = pitcherIds
    .map((id) => Object.values(players).find((p: any) => p.person.id === parseInt(id)))
    .filter(Boolean) as any[];

  if (pitchers.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-gray-100 bg-green-50">
        <h3 className="font-bold text-gray-800">{teamLabel} 投球</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 bg-gray-50 border-b border-gray-100 text-xs">
              <th className="text-left px-3 py-2 font-medium">投手</th>
              <th className="text-center px-2 py-2 font-medium tabular-nums">IP</th>
              <th className="text-center px-2 py-2 font-medium tabular-nums">H</th>
              <th className="text-center px-2 py-2 font-medium tabular-nums">R</th>
              <th className="text-center px-2 py-2 font-medium tabular-nums">ER</th>
              <th className="text-center px-2 py-2 font-medium tabular-nums">BB</th>
              <th className="text-center px-2 py-2 font-medium tabular-nums">SO</th>
              <th className="text-center px-2 py-2 font-medium tabular-nums">HR</th>
              <th className="text-center px-2 py-2 font-medium tabular-nums">ERA</th>
            </tr>
          </thead>
          <tbody>
            {pitchers.map((p: any) => {
              const pt = p.stats?.pitching ?? {};
              const season = p.seasonStats?.pitching ?? {};
              return (
                <tr key={p.person.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link href={`/player/mlb/${p.person.id}`} className="text-blue-600 hover:underline">
                      {playerName(p.person)}
                    </Link>
                    {pt.note && <span className="ml-1 text-xs text-gray-400">({pt.note})</span>}
                  </td>
                  <td className="text-center px-2 py-2 tabular-nums font-medium">{pt.inningsPitched ?? '-'}</td>
                  <td className="text-center px-2 py-2 tabular-nums">{pt.hits ?? 0}</td>
                  <td className="text-center px-2 py-2 tabular-nums">{pt.runs ?? 0}</td>
                  <td className="text-center px-2 py-2 tabular-nums font-medium">{pt.earnedRuns ?? 0}</td>
                  <td className="text-center px-2 py-2 tabular-nums">{pt.baseOnBalls ?? 0}</td>
                  <td className="text-center px-2 py-2 tabular-nums text-red-500 font-medium">{pt.strikeOuts ?? 0}</td>
                  <td className="text-center px-2 py-2 tabular-nums">{pt.homeRuns ?? 0}</td>
                  <td className="text-center px-2 py-2 tabular-nums text-gray-500 text-xs">{season.era ?? '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MatchPageClient({ gamePk }: { gamePk: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['mlb-game', gamePk],
    queryFn: () => apiFetch<Response>(`/sports/mlb/games/${gamePk}`),
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

  if (isError || !data?.data.boxscore) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20 text-gray-400">
        找不到此場比賽資料
      </div>
    );
  }

  const { linescore, boxscore, game } = data.data;
  const awayTeam = boxscore.teams?.away?.team;
  const homeTeam = boxscore.teams?.home?.team;
  const awayRuns = linescore?.teams?.away?.runs ?? game?.teams?.away?.score ?? 0;
  const homeRuns = linescore?.teams?.home?.runs ?? game?.teams?.home?.score ?? 0;
  const status = game?.status?.detailedState ?? linescore?.inningState ?? '';
  const isFinished = status === 'Final' || status === 'Game Over' || linescore?.currentInning >= 9;

  return (
    <div className="max-w-4xl mx-auto">
      {/* 麵包屑 */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        <Link href="/" className="hover:text-blue-600">首頁</Link>
        <span>/</span>
        <Link href="/board/mlb" className="hover:text-blue-600">MLB</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">比賽詳情</span>
      </nav>

      {/* 比分頭卡 */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white rounded-2xl p-6 mb-4 shadow-lg">
        <div className="flex items-center justify-between">
          {/* 客隊 */}
          <div className="flex-1 text-center">
            <img
              src={`https://www.mlbstatic.com/team-logos/${awayTeam?.id}.svg`}
              alt={teamName(awayTeam)}
              className="w-20 h-20 mx-auto mb-2"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
            <div className="text-sm text-blue-200">客隊</div>
            <div className="font-bold text-lg">{teamName(awayTeam)}</div>
            <div className={`text-5xl font-black tabular-nums mt-2 ${awayRuns > homeRuns ? '' : 'text-blue-300'}`}>
              {awayRuns}
            </div>
          </div>

          {/* 中間狀態 */}
          <div className="text-center px-4">
            <div className="text-xs text-blue-200 mb-1">
              {isFinished ? '已結束' : (linescore?.inningState ?? status) || '-'}
            </div>
            {!isFinished && linescore?.currentInning && (
              <div className="text-lg font-bold">
                {linescore.inningHalf === 'Top' ? '↑' : '↓'} {linescore.currentInning}局
              </div>
            )}
            <div className="text-2xl text-blue-300 my-2">VS</div>
            {game?.officialDate && (
              <div className="text-xs text-blue-200">{game.officialDate}</div>
            )}
          </div>

          {/* 主隊 */}
          <div className="flex-1 text-center">
            <img
              src={`https://www.mlbstatic.com/team-logos/${homeTeam?.id}.svg`}
              alt={teamName(homeTeam)}
              className="w-20 h-20 mx-auto mb-2"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
            <div className="text-sm text-blue-200">主隊</div>
            <div className="font-bold text-lg">{teamName(homeTeam)}</div>
            <div className={`text-5xl font-black tabular-nums mt-2 ${homeRuns > awayRuns ? '' : 'text-blue-300'}`}>
              {homeRuns}
            </div>
          </div>
        </div>
      </div>

      {/* 逐局比分 */}
      {linescore && <LineScoreTable linescore={linescore} boxscore={boxscore} />}

      {/* 雙方打擊 + 投球 */}
      <BattingTable teamData={boxscore.teams?.away} teamLabel={teamName(awayTeam)} />
      <PitchingTable teamData={boxscore.teams?.away} teamLabel={teamName(awayTeam)} />
      <BattingTable teamData={boxscore.teams?.home} teamLabel={teamName(homeTeam)} />
      <PitchingTable teamData={boxscore.teams?.home} teamLabel={teamName(homeTeam)} />

      <div className="text-xs text-gray-400 text-center mt-6 pb-4">
        資料來源：MLB 官方 Stats API · 翻譯：AI 輔助
      </div>
    </div>
  );
}
