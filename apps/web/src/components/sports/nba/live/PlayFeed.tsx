'use client';

import { formatClock, periodLabel, type NBALiveAction, type NBALiveTeam } from './types';

interface Props {
  actions: NBALiveAction[];
  awayTeam: NBALiveTeam | null;
  homeTeam: NBALiveTeam | null;
}

const ACTION_LABEL: Record<string, string> = {
  '2pt': '兩分',
  '3pt': '三分',
  freethrow: '罰球',
  rebound: '籃板',
  block: '火鍋',
  steal: '抄截',
  turnover: '失誤',
  foul: '犯規',
  substitution: '換人',
  timeout: '暫停',
  jumpball: '跳球',
  violation: '違例',
  period: '節',
  game: '比賽',
};

const ACTION_BADGE: Record<string, { icon: string; cls: string }> = {
  '3pt': { icon: '3', cls: 'bg-red-500 text-white' },
  '2pt': { icon: '2', cls: 'bg-blue-500 text-white' },
  freethrow: { icon: 'FT', cls: 'bg-amber-500 text-white' },
  rebound: { icon: 'R', cls: 'bg-emerald-500 text-white' },
  block: { icon: 'B', cls: 'bg-purple-500 text-white' },
  steal: { icon: 'S', cls: 'bg-green-500 text-white' },
  turnover: { icon: 'TO', cls: 'bg-gray-400 text-white' },
  foul: { icon: 'F', cls: 'bg-orange-500 text-white' },
  substitution: { icon: '↔', cls: 'bg-sky-400 text-white' },
  timeout: { icon: 'T', cls: 'bg-indigo-400 text-white' },
  jumpball: { icon: 'J', cls: 'bg-cyan-500 text-white' },
  violation: { icon: 'V', cls: 'bg-orange-400 text-white' },
  period: { icon: '⏱', cls: 'bg-gray-700 text-white' },
  game: { icon: '⚑', cls: 'bg-gray-800 text-white' },
};

export function PlayFeed({ actions, awayTeam, homeTeam }: Props) {
  if (!actions || actions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center text-sm text-gray-400">
        尚無比賽事件
      </div>
    );
  }

  // 倒序（最新在上）
  const sortedActions = [...actions].reverse();

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <span className="text-xs text-gray-500 font-medium flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          本場事件
        </span>
        <span className="text-[10px] text-gray-400">最近 {sortedActions.length} 筆</span>
      </div>

      <ul className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
        {sortedActions.map((a, idx) => {
          const badge = ACTION_BADGE[a.actionType] ?? {
            icon: '·',
            cls: 'bg-gray-200 text-gray-600',
          };
          const isAway = a.teamId === awayTeam?.teamId;
          const team = isAway ? awayTeam : a.teamId === homeTeam?.teamId ? homeTeam : null;
          const playerName =
            a.playerNameZhTw ?? a.playerName ?? a.playerNameI ?? '';
          const isMadeShot = a.shotResult === 'Made';
          const isMissedShot = a.shotResult === 'Missed';
          const points = a.pointsTotal ?? 0;

          return (
            <li
              key={a.actionNumber}
              className={`px-4 py-3 flex gap-3 items-start ${
                isMadeShot
                  ? 'bg-gradient-to-r from-amber-50/60 via-amber-50/20 to-transparent'
                  : ''
              } ${idx === 0 ? 'nba-play-slide' : ''}`}
            >
              {/* 節數/時間 */}
              <div className="flex-shrink-0 text-[10px] font-bold text-gray-500 w-12 text-right pt-0.5 leading-tight">
                <div>{periodLabel(a.period).replace('第 ', 'Q')}</div>
                <div className="text-gray-400 tabular-nums">
                  {formatClock(a.clock)}
                </div>
              </div>

              {/* 事件徽章 */}
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${badge.cls}`}
              >
                {badge.icon}
              </div>

              {/* 內容 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  {playerName && (
                    <span className="font-bold text-sm text-gray-800 truncate">
                      {playerName}
                    </span>
                  )}
                  {team && (
                    <span className="text-[10px] text-gray-400">
                      {team.teamTricode}
                    </span>
                  )}
                  <span
                    className={`text-xs font-medium ${
                      isMadeShot ? 'text-amber-700' : 'text-gray-600'
                    }`}
                  >
                    {ACTION_LABEL[a.actionType] ?? a.actionType}
                    {isMadeShot && ' ✓'}
                    {isMissedShot && ' ✗'}
                  </span>
                  {isMadeShot && points > 0 && (
                    <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1.5">
                      +{points}
                    </span>
                  )}
                </div>
                {a.description && (
                  <div className="text-[11px] text-gray-500 mt-0.5 leading-snug truncate">
                    {a.description}
                  </div>
                )}
              </div>

              {/* 即時比分 */}
              <div className="flex-shrink-0 text-[11px] text-gray-400 tabular-nums pt-1">
                {a.scoreAway}–{a.scoreHome}
              </div>
            </li>
          );
        })}
      </ul>

      <style jsx>{`
        :global(.nba-play-slide) {
          animation: nbaPlaySlide 0.5s ease-out;
        }
        @keyframes nbaPlaySlide {
          0% { opacity: 0; transform: translateY(-10px); background-color: rgba(251, 191, 36, 0.18); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
