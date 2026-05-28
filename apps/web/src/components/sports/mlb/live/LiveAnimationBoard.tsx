'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { FieldDiamond } from './FieldDiamond';
import { CountIndicator } from './CountIndicator';
import { MatchupCard } from './MatchupCard';
import { LastPitch } from './LastPitch';
import { HotZoneGrid } from './HotZoneGrid';
import { PlayFeed } from './PlayFeed';
import type { LiveResponse } from './types';

interface Props {
  gamePk: number;
  /** 從父層傳入的初始狀態（決定是否啟用輪詢） */
  abstractGameState?: string;
}

/**
 * MLB 動畫直播主容器
 *
 * - 進行中（Live）：每 10 秒輪詢一次
 * - 已結束（Final）：每 60 秒輪詢一次（仍顯示「最後一球 + 完整事件流」作為比賽回顧）
 * - 賽前（Preview）：60 秒（其實沒資料可顯示，但偶爾刷新偵測開賽）
 *
 * 比賽未開打時整個元件回傳 null，由父層改顯示先發名單。
 */
export function LiveAnimationBoard({ gamePk, abstractGameState }: Props) {
  // 根據比賽狀態決定輪詢間隔
  const interval =
    abstractGameState === 'Live'
      ? 10_000
      : abstractGameState === 'Final'
      ? 60_000
      : 60_000;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['mlb-live', gamePk],
    queryFn: () => apiFetch<LiveResponse>(`/mlb/games/${gamePk}/live`),
    refetchInterval: interval,
    staleTime: 5_000,
  });

  // 載入中（首次）
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-4 text-center">
        <span className="animate-pulse text-gray-400 text-sm">載入即時動態...</span>
      </div>
    );
  }

  if (isError || !data?.data) return null;

  const snap = data.data;
  const { linescore, matchup, lastPitch, recentPlays, teams, status } = snap;

  // 賽前（abstractGameState='Preview'）：沒有 currentPlay，先不顯示動畫板
  if (status?.abstractGameState === 'Preview' && !matchup && recentPlays.length === 0) {
    return null;
  }

  const isLive = status?.abstractGameState === 'Live';
  const isFinal = status?.abstractGameState === 'Final';

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

      {/* 主區塊：左（球場 + 計數）+ 右（投打對決 + 最後一球）
          - 手機 (<md)：縱向單欄
          - 平板 (md~lg)：左欄縮成 240px、保留雙欄
          - 桌機 (lg+)：左欄 280px
      */}
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] lg:grid-cols-[280px_1fr] gap-4 mb-4">
        {/* 左欄 */}
        <div className="space-y-3">
          <FieldDiamond
            onFirst={linescore.onFirst}
            onSecond={linescore.onSecond}
            onThird={linescore.onThird}
            outs={linescore.outs}
            isTopInning={linescore.isTopInning}
          />
          <CountIndicator
            balls={linescore.balls}
            strikes={linescore.strikes}
            outs={linescore.outs}
            inning={linescore.currentInning}
            inningOrdinal={linescore.currentInningOrdinal}
            isTopInning={linescore.isTopInning}
            inningHalf={linescore.inningHalf}
          />
        </div>

        {/* 右欄 */}
        <div className="space-y-3 min-w-0">
          {matchup && <MatchupCard matchup={matchup} />}
          {lastPitch && <LastPitch lastPitch={lastPitch} />}
        </div>
      </div>

      {/* 第二排：熱區 + 事件流
          - 手機 (<md)：縱向，熱區在上
          - 平板 (md~lg)：熱區 260px + 事件流
          - 桌機 (lg+)：熱區 300px + 事件流
      */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] lg:grid-cols-[300px_1fr] gap-4">
        {matchup && matchup.batterHotColdZones.length > 0 ? (
          <HotZoneGrid
            zones={matchup.batterHotColdZones}
            batterName={
              matchup.batter?.shortName ??
              matchup.batter?.nameZhTw ??
              matchup.batter?.fullName
            }
          />
        ) : (
          <div className="hidden md:block" />
        )}
        <PlayFeed
          plays={recentPlays}
          awayTeam={teams.away}
          homeTeam={teams.home}
        />
      </div>

      {/* footer 資料來源 */}
      <div className="text-[10px] text-gray-400 text-center mt-3">
        資料來源：MLB Stats API · GUMBO Live Feed
      </div>
    </div>
  );
}
