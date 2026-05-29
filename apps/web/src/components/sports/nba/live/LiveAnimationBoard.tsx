'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { CourtChart } from './CourtChart';
import { GameClock } from './GameClock';
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
 * 設計原則（2026-05-29 設計顧問建議）：
 * 動畫板的角色是「既有比分頭卡的進階補充」，而非「重做一份比分看板」。
 * 因此這裡不再內含 TeamScoreBar（雙隊比分 / 各節分數），那些都交給頭卡負責。
 *
 * 各狀態渲染：
 * - 賽前（gameStatus=1 / espn=pre）：不渲染（讓頭卡 + 先發名單接手）
 * - 進行中（gameStatus=2）：完整渲染 GameClock + CourtChart + OnCourtPlayers + LastPlay + PlayFeed，10s 輪詢
 * - 已結束（gameStatus=3）：只渲染 CourtChart + PlayFeed（投籃熱點圖 + 完整事件 timeline），其他元件對已結束無資訊量
 */
export function LiveAnimationBoard({ eventId, espnStatusState }: Props) {
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
      {/* 標題列：
          進行中 → 紅色 LIVE chip + 「即時動態」+ 右上「10 秒自動更新」
          已結束 → 「比賽回顧」標題（不重複比賽狀態，因為頭卡已經顯示「已結束」）
      */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="inline-flex items-center gap-1.5 bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          )}
          <h2 className="text-base font-bold text-gray-800">
            {isFinal ? '比賽回顧' : '即時動態'}
          </h2>
        </div>
        {isLive && (
          <span className="text-[10px] text-gray-400">10 秒自動更新</span>
        )}
      </div>

      {/* 進行中限定：節數時鐘（含暫停剩餘 + BONUS，這是頭卡沒有的細節） */}
      {isLive && (
        <div className="mb-4">
          <GameClock status={status} awayTeam={teams.away} homeTeam={teams.home} />
        </div>
      )}

      {/* 第一排：投籃落點圖
          進行中：左 CourtChart + 右 OnCourtPlayers 雙欄
          已結束：CourtChart 獨享一整列（場上球員對已結束無意義）
      */}
      {isLive ? (
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
      ) : (
        <div className="mb-4">
          <CourtChart
            shots={recentShots}
            awayTeamId={teams.away?.teamId}
            homeTeamId={teams.home?.teamId}
            awayName={teams.away?.shortName}
            homeName={teams.home?.shortName}
          />
        </div>
      )}

      {/* 第二排：事件流
          進行中：左 LastPlay 最新事件卡 + 右 PlayFeed
          已結束：只顯示 PlayFeed（事件 timeline 已涵蓋「最後事件」資訊）
      */}
      {isLive ? (
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
      ) : (
        <PlayFeed
          actions={recentActions}
          awayTeam={teams.away}
          homeTeam={teams.home}
        />
      )}

      <div className="text-[10px] text-gray-400 text-center mt-3">
        資料來源：cdn.nba.com Live Feed
      </div>
    </div>
  );
}
