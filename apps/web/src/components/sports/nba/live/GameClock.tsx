'use client';

import { formatClock, periodLabel, type NBALiveStatus, type NBALiveTeam } from './types';

interface Props {
  status: NBALiveStatus;
  awayTeam: NBALiveTeam | null;
  homeTeam: NBALiveTeam | null;
}

/**
 * 節數時鐘 + 暫停剩餘 + Bonus 狀態
 *
 * - 主視覺：大字節數（Q1~Q4/OT）+ 剩餘時間（mm:ss）
 * - 雙隊各顯示「剩餘暫停數」+「是否在 bonus」（已進入加罰）
 */
export function GameClock({ status, awayTeam, homeTeam }: Props) {
  const isLive = status.gameStatus === 2;
  const isFinal = status.gameStatus === 3;
  const isScheduled = status.gameStatus === 1;

  // statusText 中文化
  const statusZh = (() => {
    const t = status.statusText ?? '';
    if (t === 'Final') return '已結束';
    if (/Final\/OT/.test(t)) return '已結束（延長）';
    if (t === 'Halftime') return '中場休息';
    if (/End of/i.test(t)) return '節間';
    if (/Q\d/.test(t)) return periodLabel(status.period);
    return t || '-';
  })();

  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white rounded-xl p-4 shadow-md">
      <div className="flex items-center justify-between gap-4">
        {/* 客隊暫停 + bonus */}
        <TeamTimeoutBlock team={awayTeam} side="left" />

        {/* 中央時鐘 */}
        <div className="flex-1 text-center min-w-0">
          {isLive && (
            <>
              <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-0.5">
                {periodLabel(status.period)}
              </div>
              <div className="text-3xl sm:text-4xl font-black tabular-nums leading-none text-amber-300">
                {formatClock(status.clock)}
              </div>
            </>
          )}
          {isFinal && (
            <>
              <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-0.5">
                {statusZh}
              </div>
              <div className="text-2xl font-black text-amber-300">FINAL</div>
            </>
          )}
          {isScheduled && (
            <div className="text-lg font-bold text-gray-300">即將開始</div>
          )}
          {!isLive && !isFinal && !isScheduled && (
            <div className="text-base font-bold text-gray-300">{statusZh}</div>
          )}
        </div>

        {/* 主隊暫停 + bonus */}
        <TeamTimeoutBlock team={homeTeam} side="right" />
      </div>
    </div>
  );
}

function TeamTimeoutBlock({
  team,
  side,
}: {
  team: NBALiveTeam | null;
  side: 'left' | 'right';
}) {
  if (!team) return <div className="w-24" />;
  const align = side === 'left' ? 'text-left items-start' : 'text-right items-end';
  return (
    <div className={`flex flex-col gap-1 ${align} min-w-[80px]`}>
      <span className="text-[10px] text-gray-400 uppercase tracking-wide">
        {team.shortName}
      </span>
      <span className="text-[10px] text-gray-300 flex items-center gap-1">
        暫停剩餘
        <span className="font-bold text-amber-300 tabular-nums">
          {team.timeoutsRemaining}
        </span>
      </span>
      {team.inBonus && (
        <span className="text-[10px] font-bold text-red-400 bg-red-950/40 border border-red-700 rounded px-1.5">
          BONUS
        </span>
      )}
    </div>
  );
}
