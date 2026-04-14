'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useState } from 'react';
import { InjuriesWidget } from '@/components/sports/mlb/InjuriesWidget';

interface TeamData {
  id: number;
  name: string;
  nameZhTw?: string;
  shortName?: string;
  nickname?: string;
  abbreviation: string;
  venue?: { id: number; name: string };
  league?: { id: number; name: string };
  division?: { id: number; name: string };
  firstYearOfPlay?: string;
}

interface RosterPlayer {
  id: number;
  nameEn: string;
  nameZhTw: string;
  shortName?: string;
  position: string;
  positionName?: string;
  jerseyNumber?: string;
  status?: string;
}

interface OverviewResponse {
  data: {
    team: TeamData | null;
    stats: {
      hitting?: {
        avg: string;
        homeRuns: number;
        rbi: number;
        ops: string;
        runs: number;
        hits: number;
      };
      pitching?: {
        era: string;
        strikeOuts: number;
        whip: string;
        wins: number;
        losses: number;
        saves: number;
      };
    };
    roster: RosterPlayer[];
    recentGames: any[];
  };
}

function teamName(team: any, fallback = '未知'): string {
  if (!team) return fallback;
  return team.shortName ?? team.nameZhTw ?? team.name ?? fallback;
}

export default function TeamPageClient({ teamId }: { teamId: number }) {
  const [activeTab, setActiveTab] = useState<'roster' | 'recent' | 'injuries'>('roster');
  const [positionFilter, setPositionFilter] = useState<'all' | 'hitter' | 'pitcher'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['mlb-team-overview', teamId],
    queryFn: () => apiFetch<OverviewResponse>(`/mlb/teams/${teamId}/overview`),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <span className="animate-pulse text-gray-400">載入球隊資料中...</span>
      </div>
    );
  }

  const team = data?.data.team;
  if (!team) {
    return <div className="max-w-4xl mx-auto text-center py-20 text-gray-400">找不到球隊</div>;
  }

  const stats = data?.data.stats;
  const roster = data?.data.roster ?? [];
  const recentGames = data?.data.recentGames ?? [];

  // 篩選陣容
  const filteredRoster = roster.filter((p) => {
    if (positionFilter === 'all') return true;
    if (positionFilter === 'pitcher') return p.position === 'P';
    return p.position !== 'P';
  });

  return (
    <div className="max-w-4xl mx-auto">
      {/* 麵包屑 */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        <Link href="/" className="hover:text-blue-600">首頁</Link>
        <span>/</span>
        <Link href="/board/mlb" className="hover:text-blue-600">MLB</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{teamName(team)}</span>
      </nav>

      {/* 球隊頭卡 */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white rounded-2xl p-6 mb-4 shadow-lg">
        <div className="flex items-start gap-6 flex-wrap">
          <img
            src={`https://www.mlbstatic.com/team-logos/${team.id}.svg`}
            alt={teamName(team)}
            className="w-24 h-24 bg-white/10 rounded-xl p-2 shrink-0"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold mb-1">
              {team.nameZhTw ?? team.name}
              <span className="ml-3 text-xl text-blue-200">{team.abbreviation}</span>
            </h1>
            <div className="text-blue-200 text-sm mb-3">
              {team.name}
              {team.nickname && (
                <span className="ml-2 bg-white/10 px-2 py-0.5 rounded text-xs">「{team.nickname}」</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              {team.division && (
                <div>
                  <div className="text-blue-200 text-xs">分區</div>
                  <div className="font-medium">{team.division.name}</div>
                </div>
              )}
              {team.venue && (
                <div>
                  <div className="text-blue-200 text-xs">主場</div>
                  <div className="font-medium">{team.venue.name}</div>
                </div>
              )}
              {team.firstYearOfPlay && (
                <div>
                  <div className="text-blue-200 text-xs">建隊</div>
                  <div className="font-medium">{team.firstYearOfPlay}</div>
                </div>
              )}
              {stats?.pitching && (
                <div>
                  <div className="text-blue-200 text-xs">本季戰績</div>
                  <div className="font-medium">
                    {stats.pitching.wins}勝 {stats.pitching.losses}敗
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 本季統計 */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {stats.hitting && (
            <div className="bg-white rounded-xl border border-blue-100 p-4">
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span className="text-lg">🎯</span>
                <span>打擊統計</span>
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <StatBox label="打擊率" value={stats.hitting.avg} />
                <StatBox label="全壘打" value={stats.hitting.homeRuns} />
                <StatBox label="打點" value={stats.hitting.rbi} />
                <StatBox label="OPS" value={stats.hitting.ops} />
                <StatBox label="得分" value={stats.hitting.runs} />
                <StatBox label="安打" value={stats.hitting.hits} />
              </div>
            </div>
          )}

          {stats.pitching && (
            <div className="bg-white rounded-xl border border-green-100 p-4">
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span className="text-lg">⚾</span>
                <span>投手統計</span>
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <StatBox label="防禦率" value={stats.pitching.era} />
                <StatBox label="三振" value={stats.pitching.strikeOuts} />
                <StatBox label="WHIP" value={stats.pitching.whip} />
                <StatBox label="勝" value={stats.pitching.wins} />
                <StatBox label="敗" value={stats.pitching.losses} />
                <StatBox label="救援" value={stats.pitching.saves} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <div className="flex border-b border-gray-100">
          <button
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'roster'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('roster')}
          >
            陣容（{roster.length}）
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'recent'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('recent')}
          >
            近期比賽（{recentGames.length}）
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'injuries'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('injuries')}
          >
            🏥 傷兵
          </button>
        </div>

        {activeTab === 'roster' && (
          <div>
            {/* 位置篩選 */}
            <div className="flex gap-2 p-3 border-b border-gray-100 bg-gray-50">
              {[
                { key: 'all', label: '全部' },
                { key: 'hitter', label: '野手' },
                { key: 'pitcher', label: '投手' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setPositionFilter(f.key as any)}
                  className={`text-xs px-3 py-1 rounded-full transition-colors ${
                    positionFilter === f.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* 陣容列表 */}
            <div className="divide-y divide-gray-100">
              {filteredRoster.map((p) => (
                <Link
                  key={p.id}
                  href={`/player/mlb/${p.id}`}
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors"
                >
                  <img
                    src={`https://img.mlbstatic.com/mlb-photos/image/upload/w_64,q_auto:best/v1/people/${p.id}/headshot/67/current`}
                    alt={p.nameZhTw}
                    className="w-10 h-10 rounded-full bg-gray-100 object-cover"
                    onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                  />
                  {p.jerseyNumber && (
                    <span className="text-xs text-gray-400 font-mono w-8">#{p.jerseyNumber}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{p.nameZhTw}</div>
                    <div className="text-xs text-gray-400 truncate">{p.nameEn}</div>
                  </div>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    {p.position}
                  </span>
                </Link>
              ))}
            </div>

            {filteredRoster.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">沒有符合條件的球員</div>
            )}
          </div>
        )}

        {activeTab === 'recent' && (
          <div className="divide-y divide-gray-100">
            {recentGames.slice().reverse().map((g: any) => {
              const isHome = g.teams.home.team.id === teamId;
              const opp = isHome ? g.teams.away : g.teams.home;
              const myScore = isHome ? g.teams.home.score : g.teams.away.score;
              const oppScore = isHome ? g.teams.away.score : g.teams.home.score;
              const win = myScore > oppScore;
              const isFinal = g.status?.detailedState === 'Final';

              return (
                <Link
                  key={g.gamePk}
                  href={`/match/mlb/${g.gamePk}`}
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="text-xs text-gray-500 font-mono w-16 shrink-0">
                    {g.officialDate?.slice(5)}
                  </div>
                  {isFinal && (
                    <span
                      className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                        win ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {win ? '勝' : '負'}
                    </span>
                  )}
                  <div className="flex-1 min-w-0 text-sm">
                    {isHome ? 'vs ' : '@ '}
                    <span className="font-medium">{opp.team.name}</span>
                  </div>
                  <div className="font-bold tabular-nums text-sm">
                    {isFinal ? `${myScore} - ${oppScore}` : g.status?.detailedState}
                  </div>
                </Link>
              );
            })}

            {recentGames.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">近期無比賽</div>
            )}
          </div>
        )}

        {activeTab === 'injuries' && (
          <div className="p-3">
            <InjuriesWidget teamId={teamId} days={30} />
          </div>
        )}
      </div>

      <div className="text-xs text-gray-400 text-center mt-6 pb-4">
        資料來源：MLB 官方 Stats API · 翻譯：AI 輔助
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: any }) {
  return (
    <div className="text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-bold text-gray-900 tabular-nums">{value ?? '-'}</div>
    </div>
  );
}
