'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { CourtChart } from './CourtChart';
import { GameClock } from './GameClock';
import { TeamScoreBar } from './TeamScoreBar';
import { LastPlay } from './LastPlay';
import { OnCourtPlayers } from './OnCourtPlayers';
import { PlayFeed } from './PlayFeed';
import type { NBALiveResponse } from './types';

interface Props {
  eventId: string;
  /** ESPN summary 給的狀態描述（決定輪詢頻率） */
  espnStatusState?: string; // 'pre' / 'in' / 'post'
}

/**
 * NBA 動畫直播主容器
 *
 * - 進行中（gameStatus=2 或 espn=in）：10 秒輪詢
 * - 已結束（gameStatus=3 或 espn=post）：60 秒輪詢
 * - 賽前（gameStatus=1 或 espn=pre）：不渲染（讓父層保留既有 UI）
 */
export function LiveAnimationBoard({ eventId, espnStatusState }: Props) {
  // 第一次先用 ESPN 狀態決定輪詢頻率；資料到位後改用 NBA gameStatus
  const initialInterval =
    espnStatusState === 'in' ? 10_000 : espnStatusState === 'post' ? 60_000 : 60_000;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['nba-live', eventId],
    queryFn: () => apiFetch<NBALiveResponse>(`/nba/games/${eventId}/live`),
    refetchInterval: (q) => {
      const status = q.state.data?.data?.status?.gameStatus;
      if (status === 2) return 10_000;
      if (status === 3) return 60_000;
      return initialInterval;
    },
    staleTime: 5_000,
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-4 text-center">
        <span className="animate-pulse text-gray-400 text-sm">載入即時動態...</span>
      </div>
    );
  }

  if (isError || !data?.data) return null;

  const snap = data.data;
  const { teams, players, status, recentActions, recentShots } = snap;

  // 賽前比賽資料還沒生成 box/pbp，不渲染
  if (status.gameStatus === 1) return null;

  const isLive = status.gameStatus === 2;
  const isFinal = status.gameStatus === 3;
  const lastAction = recentActions[recentActions.length - 1] ?? null;

  return (
    <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl border border-gray-200 p-4 sm:p-5 mb-4 shadow-sm">
      {/* 標題列 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="inline-flex items-center gap-1.5 bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          )}
          {isFinal && (
            <span className="inline-block bg-gray-700 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              比賽結束
            </span>
          )}
          <h2 className="text-base font-bold text-gray-800">即時動態</h2>
        </div>
        <span className="text-[10px] text-gray-400">
          {isLive ? '10 秒自動更新' : isFinal ? '比賽回顧' : ''}
        </span>
      </div>

      {/* 第一排：比分區（雙隊大字 + 各節分數） */}
      <div className="mb-4">
        <TeamScoreBar awayTeam={teams.away} homeTeam={teams.home} />
      </div>

      {/* 第二排：節數時鐘 */}
      <div className="mb-4">
        <GameClock status={status} awayTeam={teams.away} homeTeam={teams.home} />
      </div>

      {/* 第三排：投籃落點 + 場上球員 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4 mb-4">
        <CourtChart
          shots={recentShots}
          awayTeamId={teams.away?.teamId}
          homeTeamId={teams.home?.teamId}
          awayName={teams.away?.shortName}
          homeName={teams.home?.shortName}
        />
        <OnCourtPlayers
          awayTeam={teams.away}
          homeTeam={teams.home}
          awayPlayers={players.away}
          homePlayers={players.home}
        />
      </div>

      {/* 第四排：最後事件卡 + 事件流 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
        <LastPlay
          action={lastAction}
          awayTeamId={teams.away?.teamId}
          homeTeamId={teams.home?.teamId}
        />
        <PlayFeed
          actions={recentActions}
          awayTeam={teams.away}
          homeTeam={teams.home}
        />
      </div>

      <div className="text-[10px] text-gray-400 text-center mt-3">
        資料來源：cdn.nba.com Live Feed
      </div>
    </div>
  );
}
