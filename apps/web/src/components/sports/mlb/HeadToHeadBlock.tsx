'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

interface H2HResponse {
  data: {
    games: any[];
    summary: { total: number; teamWins: number; opponentWins: number };
  };
}

interface HeadToHeadBlockProps {
  teamId: number;
  opponentId: number;
  teamName: string;
  opponentName: string;
  limit?: number;
}

export function HeadToHeadBlock({
  teamId,
  opponentId,
  teamName,
  opponentName,
  limit = 10,
}: HeadToHeadBlockProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['mlb-h2h', teamId, opponentId, limit],
    queryFn: () =>
      apiFetch<H2HResponse>(`/mlb/teams/${teamId}/h2h/${opponentId}?limit=${limit}`),
    staleTime: 60 * 60 * 1000, // 1 小時
  });

  if (isLoading || !data?.data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h3 className="font-bold text-gray-800 mb-2">歷史對戰</h3>
        <p className="text-sm text-gray-400">載入中...</p>
      </div>
    );
  }

  const { games, summary } = data.data;

  if (games.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h3 className="font-bold text-gray-800 mb-2">歷史對戰</h3>
        <p className="text-sm text-gray-400">近期無交手紀錄</p>
      </div>
    );
  }

  const teamWinPct = ((summary.teamWins / summary.total) * 100).toFixed(0);
  const oppWinPct = ((summary.opponentWins / summary.total) * 100).toFixed(0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="font-bold text-gray-800">歷史對戰 · 近 {games.length} 場</h3>
      </div>

      {/* 戰績摘要 */}
      <div className="p-4 bg-gradient-to-r from-blue-50 to-red-50">
        <div className="flex items-center justify-between text-sm mb-2">
          <div className="font-medium text-blue-700">
            {teamName} <span className="text-xl font-bold">{summary.teamWins}</span> 勝
          </div>
          <span className="text-gray-400 text-xs">{summary.total} 場</span>
          <div className="font-medium text-red-700 text-right">
            <span className="text-xl font-bold">{summary.opponentWins}</span> 勝 {opponentName}
          </div>
        </div>
        <div className="flex rounded-full overflow-hidden h-2 bg-gray-200">
          <div
            className="bg-blue-500 transition-all"
            style={{ width: `${teamWinPct}%` }}
          />
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${oppWinPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{teamWinPct}%</span>
          <span>{oppWinPct}%</span>
        </div>
      </div>

      {/* 比賽列表 */}
      <div className="divide-y divide-gray-100">
        {games.map((g: any) => {
          const isTeamHome = g.teams.home.team.id === teamId;
          const teamScore = isTeamHome ? g.teams.home.score : g.teams.away.score;
          const oppScore = isTeamHome ? g.teams.away.score : g.teams.home.score;
          const teamWon = teamScore > oppScore;

          return (
            <Link
              key={g.gamePk}
              href={`/match/mlb/${g.gamePk}`}
              className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-sm"
            >
              <div className="text-xs text-gray-500 font-mono w-20 shrink-0">
                {g.officialDate}
              </div>
              <span
                className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                  teamWon ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {teamWon ? '勝' : '負'}
              </span>
              <div className="flex-1 min-w-0 text-gray-700">
                {isTeamHome ? '主場' : '客場'}
              </div>
              <div className="font-bold tabular-nums">
                {teamScore} : {oppScore}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
