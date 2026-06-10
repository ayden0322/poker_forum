'use client';

import Link from 'next/link';

interface NTeam {
  id: number;
  name: string;
  nameZhTw?: string | null;
  shortName?: string | null;
  logo: string;
  score?: number | null;
}
interface NGame {
  id: number;
  date: string;
  timestamp: number;
  statusShort: string;
  teams: { home: NTeam; away: NTeam };
}
interface NStanding {
  rank: number;
  team: { id: number; name: string; nameZhTw?: string | null; logo: string };
  played: number | null;
  wins: number;
  losses: number;
  winPct: number | null;
}
export interface TeamOverview {
  team: NTeam | null;
  recentGames: NGame[];
  standings: NStanding[];
}

function label(t: { name: string; nameZhTw?: string | null }): string {
  return t.nameZhTw ?? t.name;
}

function twDate(ts: number): string {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' });
}

export default function BasketballTeamClient({
  league,
  leagueName,
  teamId,
  teamName,
  logo,
  overview,
}: {
  league: string;
  leagueName: string;
  teamId: number;
  teamName: string;
  logo: string;
  overview: TeamOverview;
}) {
  const row = overview.standings?.find((s) => s.team.id === teamId);
  const finished = (overview.recentGames ?? []).filter((g) => g.statusShort === 'FT').slice(0, 12);

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <nav className="text-xs text-gray-400 mb-3 flex items-center gap-1">
        <Link href="/" className="hover:text-gray-600">首頁</Link>
        <span>›</span>
        <Link href={`/board/${league}`} className="hover:text-gray-600">{leagueName}</Link>
        <span>›</span>
        <span className="text-gray-500">{teamName}</span>
      </nav>

      {/* 球隊 header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 flex items-center gap-4">
        {logo && (
          <img
            src={logo}
            alt={teamName}
            className="w-16 h-16 object-contain"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900">{teamName}</h1>
          <div className="text-sm text-gray-500 mt-1">
            {row ? (
              <span>
                聯盟第 <b className="text-orange-600">{row.rank}</b> 名 · 戰績{' '}
                <b className="text-green-700">{row.wins}</b>勝<b className="text-red-600">{row.losses}</b>敗
                {row.winPct != null && <span className="text-gray-400"> · 勝率 {row.winPct.toFixed(3)}</span>}
              </span>
            ) : (
              <span className="text-gray-400">{leagueName}</span>
            )}
          </div>
        </div>
      </div>

      {/* 近期賽事 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <div className="px-4 py-2 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-white text-sm font-bold text-gray-700">
          近期賽事
        </div>
        {finished.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-xs">尚無已結束的比賽紀錄</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {finished.map((g) => {
              const isHome = g.teams.home.id === teamId;
              const me = isHome ? g.teams.home : g.teams.away;
              const opp = isHome ? g.teams.away : g.teams.home;
              const win = (me.score ?? 0) > (opp.score ?? 0);
              return (
                <li key={g.id}>
                  <Link
                    href={`/match/basketball/${league}/${g.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-sm"
                  >
                    <span className="text-xs text-gray-400 w-12 flex-shrink-0">{twDate(g.timestamp)}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${win ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {win ? '勝' : '負'}
                    </span>
                    <span className="text-gray-400 text-xs flex-shrink-0">{isHome ? '主' : '客'}</span>
                    <span className="text-gray-700 truncate flex-1">vs {label(opp)}</span>
                    <span className="tabular-nums font-bold text-gray-900 flex-shrink-0">
                      {me.score} - {opp.score}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 聯盟排名（highlight 本隊） */}
      {overview.standings?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
          <div className="px-4 py-2 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-white text-sm font-bold text-gray-700">
            {leagueName}排名
          </div>
          <table className="w-full text-sm">
            <tbody>
              {overview.standings.map((s) => (
                <tr
                  key={s.team.id}
                  className={`border-b border-gray-50 ${s.team.id === teamId ? 'bg-orange-50 font-medium' : ''}`}
                >
                  <td className="px-3 py-2 text-gray-500 w-8">{s.rank}</td>
                  <td className="px-2 py-2">
                    <Link href={`/team/basketball/${league}/${s.team.id}`} className="flex items-center gap-2 hover:text-orange-600">
                      {s.team.logo && (
                        <img src={s.team.logo} alt="" className="w-5 h-5 object-contain" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                      )}
                      <span className="text-gray-800">{label(s.team)}</span>
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums text-gray-600">{s.wins}-{s.losses}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-blue-600">{s.winPct != null ? s.winPct.toFixed(3) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-3">
        <Link href={`/board/${league}`} className="flex-1 text-center py-2.5 rounded-lg bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 transition-colors">
          💬 進 {leagueName} 討論區
        </Link>
      </div>
    </div>
  );
}
