'use client';

import type { NBALiveTeam } from './types';

interface Props {
  awayTeam: NBALiveTeam | null;
  homeTeam: NBALiveTeam | null;
}

const NBA_TEAM_LOGO = (teamId: number) =>
  `https://cdn.nba.com/logos/nba/${teamId}/global/L/logo.svg`;

/**
 * 雙隊比分大字 + 各節分數 mini 表 + 領先差距 chip
 *
 * 領先方分數高亮（白）、落後方淡化（gray-400）
 */
export function TeamScoreBar({ awayTeam, homeTeam }: Props) {
  if (!awayTeam || !homeTeam) return null;

  const diff = (awayTeam.score ?? 0) - (homeTeam.score ?? 0);
  const awayLeading = diff > 0;
  const homeLeading = diff < 0;
  const tied = diff === 0;

  const periods = Math.max(awayTeam.periods.length, homeTeam.periods.length, 4);
  const periodLabels = Array.from({ length: periods }, (_, i) =>
    i < 4 ? `Q${i + 1}` : `OT${i - 3}`,
  );

  const findPeriod = (team: NBALiveTeam, p: number) =>
    team.periods.find((x) => x.period === p)?.score ?? null;

  return (
    <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 text-white rounded-xl p-4 shadow-lg">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-3">
        {/* 客隊 */}
        <TeamSide team={awayTeam} leading={awayLeading} align="right" />

        {/* 中央 VS 或差距 */}
        <div className="flex flex-col items-center gap-1 px-2">
          {tied ? (
            <span className="text-xs font-bold text-amber-300 bg-amber-500/20 border border-amber-400 rounded-full px-2 py-0.5">
              平手
            </span>
          ) : (
            <span className="text-xs font-bold text-amber-300 bg-amber-500/20 border border-amber-400 rounded-full px-2 py-0.5">
              {awayLeading ? '客隊' : '主隊'} 領先 {Math.abs(diff)}
            </span>
          )}
          <span className="text-xs text-blue-200">VS</span>
        </div>

        {/* 主隊 */}
        <TeamSide team={homeTeam} leading={homeLeading} align="left" />
      </div>

      {/* 各節分數表 */}
      <div className="bg-black/20 rounded-lg p-2 overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-blue-200">
              <th className="text-left px-2 py-1 font-medium w-16">隊伍</th>
              {periodLabels.map((p) => (
                <th key={p} className="text-center px-1 py-1 font-medium w-8">
                  {p}
                </th>
              ))}
              <th className="text-center px-2 py-1 font-bold text-amber-300 w-10">
                總分
              </th>
            </tr>
          </thead>
          <tbody>
            {[awayTeam, homeTeam].map((team) => {
              const isLeading =
                (team === awayTeam && awayLeading) ||
                (team === homeTeam && homeLeading);
              return (
                <tr key={team.teamId}>
                  <td className="text-left px-2 py-1 font-bold">
                    {team.shortName}
                  </td>
                  {periodLabels.map((_, i) => {
                    const p = i + 1;
                    const v = findPeriod(team, p);
                    return (
                      <td
                        key={p}
                        className="text-center px-1 py-1 text-blue-100"
                      >
                        {v ?? '-'}
                      </td>
                    );
                  })}
                  <td
                    className={`text-center px-2 py-1 font-black ${
                      isLeading ? 'text-amber-300' : 'text-blue-200'
                    }`}
                  >
                    {team.score}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamSide({
  team,
  leading,
  align,
}: {
  team: NBALiveTeam;
  leading: boolean;
  align: 'left' | 'right';
}) {
  const flex =
    align === 'right' ? 'flex-row-reverse text-right' : 'flex-row text-left';
  return (
    <div className={`flex items-center gap-3 ${flex}`}>
      <img
        src={NBA_TEAM_LOGO(team.teamId)}
        alt={team.teamTricode}
        className="w-14 h-14 sm:w-16 sm:h-16 object-contain"
        onError={(e) => {
          (e.target as HTMLImageElement).style.opacity = '0.3';
        }}
      />
      <div>
        <div className="text-xs text-blue-200">{team.teamTricode}</div>
        <div className="text-sm font-bold leading-tight">{team.nameZhTw}</div>
        <div
          className={`text-4xl sm:text-5xl font-black tabular-nums mt-0.5 ${
            leading ? 'text-amber-300 mlb-score-pulse' : 'text-blue-300'
          }`}
        >
          {team.score}
        </div>
      </div>

      <style jsx>{`
        :global(.mlb-score-pulse) {
          animation: scorePulse 1.8s ease-in-out infinite;
        }
        @keyframes scorePulse {
          0%, 100% { text-shadow: 0 0 0 transparent; }
          50% { text-shadow: 0 0 14px rgba(252, 211, 77, 0.6); }
        }
      `}</style>
    </div>
  );
}
