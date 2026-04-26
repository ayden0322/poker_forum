'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useState } from 'react';
import { BaseballInjuriesWidget } from '@/components/sports/BaseballInjuriesWidget';

const LEAGUE_NAMES: Record<string, string> = {
  cpbl: '中華職棒',
  npb: '日本職棒',
  kbo: '韓國職棒',
};

const LEAGUE_GRADIENTS: Record<string, string> = {
  cpbl: 'from-red-700 to-red-900',
  npb: 'from-indigo-700 to-indigo-900',
  kbo: 'from-emerald-700 to-emerald-900',
};

interface Team {
  id: number;
  name: string;
  nameZhTw?: string;
  shortName?: string;
  logo?: string;
  country?: { name: string; flag: string };
}

interface NormalizedGame {
  id: number;
  date: string;
  timestamp: number;
  status: string;
  statusShort: string;
  teams: {
    home: { id: number; name: string; nameZhTw?: string; shortName?: string; logo: string; score: number | null };
    away: { id: number; name: string; nameZhTw?: string; shortName?: string; logo: string; score: number | null };
  };
}

interface OverviewResponse {
  data: {
    team: Team | null;
    recentGames: NormalizedGame[];
    standings: any[];
  };
}

function teamDisplayName(team: { name: string; nameZhTw?: string; shortName?: string }): string {
  return team.shortName ?? team.nameZhTw ?? team.name;
}

function twDate(timestamp: number): string {
  try {
    return new Date(timestamp * 1000).toLocaleDateString('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: 'numeric',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function TeamPageClient({ league, teamId }: { league: string; teamId: number }) {
  const [activeTab, setActiveTab] = useState<'roster' | 'recent' | 'injuries' | 'standings'>('recent');

  const leagueName = LEAGUE_NAMES[league] ?? league.toUpperCase();
  const gradient = LEAGUE_GRADIENTS[league] ?? 'from-gray-700 to-gray-900';

  const { data, isLoading } = useQuery({
    queryKey: ['baseball-team-overview', league, teamId],
    queryFn: () => apiFetch<OverviewResponse>(`/baseball/${league}/teams/${teamId}/overview`),
    staleTime: 10 * 60 * 1000,
  });

  // 球員名單
  const { data: playersData } = useQuery({
    queryKey: ['baseball-team-players', league, teamId],
    queryFn: () => apiFetch<{ data: any[] }>(`/baseball/${league}/players?teamId=${teamId}`),
    staleTime: 60 * 60 * 1000,
    enabled: activeTab === 'roster',
  });

  const team = data?.data?.team;

  // SSR 友善的載入態：先顯示麵包屑 + 標題骨架
  if (isLoading || !team) {
    return (
      <div className="max-w-4xl mx-auto">
        <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
          <Link href="/" className="hover:text-blue-600">首頁</Link>
          <span>/</span>
          <Link href={`/board/${league}`} className="hover:text-blue-600">{leagueName}</Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">球隊 #{teamId}</span>
        </nav>
        <div className={`bg-gradient-to-r ${gradient} text-white rounded-2xl p-6 mb-4 shadow-lg`}>
          <div className="text-white/80 text-center py-4">
            {isLoading ? (
              <span className="animate-pulse">載入球隊資料中...</span>
            ) : (
              `找不到球隊 #${teamId}`
            )}
          </div>
        </div>
      </div>
    );
  }

  const recentGames = data?.data?.recentGames ?? [];
  const standings = data?.data?.standings ?? [];
  const players = playersData?.data ?? [];

  // 從近期賽事推算戰績
  const finishedGames = recentGames.filter((g) => ['FT', 'AOT'].includes(g.statusShort));
  let wins = 0, losses = 0;
  for (const g of finishedGames) {
    const isHome = g.teams.home.id === teamId;
    const my = isHome ? g.teams.home.score : g.teams.away.score;
    const opp = isHome ? g.teams.away.score : g.teams.home.score;
    if (my == null || opp == null) continue;
    if (my > opp) wins++;
    else if (opp > my) losses++;
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* 麵包屑 */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        <Link href="/" className="hover:text-blue-600">首頁</Link>
        <span>/</span>
        <Link href={`/board/${league}`} className="hover:text-blue-600">{leagueName}</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{teamDisplayName(team)}</span>
      </nav>

      {/* 球隊頭卡 */}
      <div className={`bg-gradient-to-r ${gradient} text-white rounded-2xl p-6 mb-4 shadow-lg`}>
        <div className="flex items-start gap-6 flex-wrap">
          {team.logo && (
            <img
              src={team.logo}
              alt={team.name}
              className="w-24 h-24 bg-white/10 rounded-xl p-2 shrink-0 object-contain"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold mb-1">
              {team.nameZhTw ?? team.name}
            </h1>
            {team.nameZhTw && team.name !== team.nameZhTw && (
              <div className="text-white/70 text-sm mb-3">{team.name}</div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-white/60 text-xs">聯盟</div>
                <div className="font-medium">{leagueName}</div>
              </div>
              {team.country && (
                <div>
                  <div className="text-white/60 text-xs">國家</div>
                  <div className="font-medium flex items-center gap-1">
                    {team.country.flag && <img src={team.country.flag} alt="" className="w-4 h-3" />}
                    {team.country.name}
                  </div>
                </div>
              )}
              {finishedGames.length > 0 && (
                <div>
                  <div className="text-white/60 text-xs">近期戰績</div>
                  <div className="font-medium">
                    {wins}勝 {losses}敗
                  </div>
                </div>
              )}
              <div>
                <div className="text-white/60 text-xs">近期賽事</div>
                <div className="font-medium">{recentGames.length} 場</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 季統計卡片（API-Sports 棒球無此資料，顯示 placeholder） */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-blue-100 p-4">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="text-lg">🎯</span>
            <span>打擊統計</span>
          </h3>
          <div className="text-sm text-gray-400 text-center py-4">
            敬請期待
            <div className="text-[11px] mt-1 opacity-70">將整合官方資料源</div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-green-100 p-4">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="text-lg">⚾</span>
            <span>投手統計</span>
          </h3>
          <div className="text-sm text-gray-400 text-center py-4">
            敬請期待
            <div className="text-[11px] mt-1 opacity-70">將整合官方資料源</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          <TabButton active={activeTab === 'recent'} onClick={() => setActiveTab('recent')}>
            近期比賽（{recentGames.length}）
          </TabButton>
          <TabButton active={activeTab === 'roster'} onClick={() => setActiveTab('roster')}>
            陣容{players.length > 0 ? `（${players.length}）` : ''}
          </TabButton>
          <TabButton active={activeTab === 'standings'} onClick={() => setActiveTab('standings')}>
            排名
          </TabButton>
          <TabButton active={activeTab === 'injuries'} onClick={() => setActiveTab('injuries')}>
            🏥 傷兵
          </TabButton>
        </div>

        {/* 近期比賽 */}
        {activeTab === 'recent' && (
          <div className="divide-y divide-gray-100">
            {recentGames.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">近期無比賽</div>
            ) : (
              recentGames.map((g) => {
                const isHome = g.teams.home.id === teamId;
                const opp = isHome ? g.teams.away : g.teams.home;
                const myScore = isHome ? g.teams.home.score : g.teams.away.score;
                const oppScore = isHome ? g.teams.away.score : g.teams.home.score;
                const isFinal = ['FT', 'AOT'].includes(g.statusShort);
                const win = isFinal && myScore != null && oppScore != null && myScore > oppScore;
                const lose = isFinal && myScore != null && oppScore != null && myScore < oppScore;

                return (
                  <Link
                    key={g.id}
                    href={`/match/baseball/${league}/${g.id}`}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="text-xs text-gray-500 font-mono w-16 shrink-0">
                      {twDate(g.timestamp)}
                    </div>
                    {isFinal && (
                      <span
                        className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                          win ? 'bg-green-100 text-green-700' : lose ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {win ? '勝' : lose ? '負' : '和'}
                      </span>
                    )}
                    {opp.logo && (
                      <img src={opp.logo} alt="" className="w-6 h-6 object-contain" />
                    )}
                    <div className="flex-1 min-w-0 text-sm">
                      {isHome ? 'vs ' : '@ '}
                      <span className="font-medium">{teamDisplayName(opp)}</span>
                    </div>
                    <div className="font-bold tabular-nums text-sm">
                      {isFinal ? `${myScore} - ${oppScore}` : g.status}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        )}

        {/* 陣容 */}
        {activeTab === 'roster' && (
          <div className="divide-y divide-gray-100">
            {players.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                尚無陣容資料
                <div className="text-[11px] mt-1 opacity-70">資料來源：API-Sports（部分聯賽資料較少）</div>
              </div>
            ) : (
              players.map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
                    {p.firstname?.charAt(0) ?? p.name?.charAt(0) ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {p.name ?? `${p.firstname ?? ''} ${p.lastname ?? ''}`.trim()}
                    </div>
                    {p.position && (
                      <div className="text-xs text-gray-400 truncate">{p.position}</div>
                    )}
                  </div>
                  {p.age && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      {p.age} 歲
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* 排名 */}
        {activeTab === 'standings' && (
          <div className="p-4">
            <StandingsTable standings={standings} currentTeamId={teamId} />
          </div>
        )}

        {/* 傷兵 */}
        {activeTab === 'injuries' && (
          <div className="p-3">
            <BaseballInjuriesWidget league={league} teamId={teamId} />
          </div>
        )}
      </div>

      <div className="text-xs text-gray-400 text-center mt-6 pb-4">
        資料來源：API-Sports · {leagueName}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
        active
          ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
          : 'text-gray-500 hover:text-gray-700'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function StandingsTable({ standings, currentTeamId }: { standings: any[]; currentTeamId: number }) {
  const rows: any[] = [];
  if (Array.isArray(standings)) {
    for (const item of standings) {
      if (Array.isArray(item)) rows.push(...item);
      else rows.push(item);
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">暫無排名資料</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-gray-500 border-b border-gray-100 text-xs">
          <th className="text-left py-2 font-medium">#</th>
          <th className="text-left py-2 font-medium">球隊</th>
          <th className="text-center py-2 font-medium">勝</th>
          <th className="text-center py-2 font-medium">敗</th>
          <th className="text-center py-2 font-medium">勝率</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row: any, idx: number) => {
          const isCurrentTeam = row.team?.id === currentTeamId;
          const w = row.games?.win?.total ?? row.won ?? 0;
          const l = row.games?.lose?.total ?? row.lost ?? 0;
          const total = w + l;
          const pct = total > 0 ? (w / total).toFixed(3) : '.000';

          return (
            <tr
              key={row.team?.id ?? idx}
              className={`border-b border-gray-50 ${isCurrentTeam ? 'bg-blue-50 font-bold' : ''}`}
            >
              <td className="py-2 text-gray-400">{row.position ?? idx + 1}</td>
              <td className="py-2">
                <div className="flex items-center gap-1.5">
                  {row.team?.logo && (
                    <img src={row.team.logo} alt="" className="w-4 h-4 object-contain" />
                  )}
                  <span className={isCurrentTeam ? 'text-blue-700' : ''}>
                    {row.team?.name ?? '?'}
                  </span>
                </div>
              </td>
              <td className="text-center py-2 tabular-nums">{w}</td>
              <td className="text-center py-2 tabular-nums">{l}</td>
              <td className="text-center py-2 tabular-nums text-gray-500">{pct}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
