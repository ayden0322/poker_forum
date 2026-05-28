'use client';

import Link from 'next/link';
import { formatClock, periodLabel, type NBALiveAction } from './types';

interface Props {
  action: NBALiveAction | null;
  awayTeamId?: number;
  homeTeamId?: number;
}

const HEADSHOT = (personId: number) =>
  `https://cdn.nba.com/headshots/nba/latest/1040x760/${personId}.png`;

/**
 * actionType 中文化
 */
function actionTypeLabel(actionType?: string, subType?: string): string {
  switch (actionType) {
    case '2pt':
      return '兩分球';
    case '3pt':
      return '三分球';
    case 'freethrow':
      return '罰球';
    case 'rebound':
      return subType === 'offensive' ? '進攻籃板' : '防守籃板';
    case 'block':
      return '火鍋';
    case 'steal':
      return '抄截';
    case 'turnover':
      return '失誤';
    case 'foul':
      return '犯規';
    case 'substitution':
      return '換人';
    case 'timeout':
      return '暫停';
    case 'jumpball':
      return '跳球';
    case 'violation':
      return '違例';
    case 'period':
      return subType === 'start' ? '節開始' : '節結束';
    case 'game':
      return subType === 'start' ? '比賽開始' : '比賽結束';
    default:
      return actionType ?? '-';
  }
}

/** actionType 顏色配 */
function actionTypeStyle(actionType?: string, shotResult?: string) {
  if (actionType === '3pt') {
    return shotResult === 'Made'
      ? 'bg-red-500 text-white border-red-600'
      : 'bg-red-50 text-red-600 border-red-300';
  }
  if (actionType === '2pt') {
    return shotResult === 'Made'
      ? 'bg-blue-500 text-white border-blue-600'
      : 'bg-blue-50 text-blue-600 border-blue-300';
  }
  if (actionType === 'freethrow') {
    return 'bg-amber-500 text-white border-amber-600';
  }
  if (actionType === 'block') {
    return 'bg-purple-500 text-white border-purple-600';
  }
  if (actionType === 'steal') {
    return 'bg-green-500 text-white border-green-600';
  }
  if (actionType === 'turnover') {
    return 'bg-gray-400 text-white border-gray-500';
  }
  if (actionType === 'foul') {
    return 'bg-orange-500 text-white border-orange-600';
  }
  return 'bg-gray-100 text-gray-700 border-gray-300';
}

export function LastPlay({ action, awayTeamId, homeTeamId }: Props) {
  if (!action) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center text-sm text-gray-400">
        尚無比賽事件
      </div>
    );
  }

  const playerName =
    action.playerNameZhTw ??
    action.playerName ??
    action.playerNameI ??
    '系統事件';

  const isScore = action.shotResult === 'Made' || (action.pointsTotal ?? 0) > 0;
  const isHomePlay = action.teamId === homeTeamId;
  const teamSide = action.teamId === awayTeamId ? '客隊' : isHomePlay ? '主隊' : '';

  return (
    <div
      className={`bg-white rounded-xl border p-4 shadow-sm ${
        isScore ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-white' : 'border-gray-200'
      }`}
    >
      <div className="text-xs text-gray-500 font-medium mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          最後事件
        </span>
        <span className="text-[10px] text-gray-400">
          {periodLabel(action.period)} · {formatClock(action.clock)}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* 球員頭像 */}
        {action.personId ? (
          <Link href={`/player/nba/${action.personId}`} className="flex-shrink-0">
            <img
              src={HEADSHOT(action.personId)}
              alt={playerName}
              className="w-14 h-14 rounded-full object-cover border-2 border-gray-200 bg-gray-100"
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = '0.3';
              }}
            />
          </Link>
        ) : (
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 flex-shrink-0">
            系統
          </div>
        )}

        {/* 內容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap mb-1">
            <span
              className={`inline-block text-[10px] font-bold border rounded-full px-2 py-0.5 ${actionTypeStyle(
                action.actionType,
                action.shotResult,
              )}`}
            >
              {actionTypeLabel(action.actionType, action.subType)}
              {action.shotResult === 'Made' && ' ✓'}
              {action.shotResult === 'Missed' && ' ✗'}
            </span>
            {action.teamTricode && (
              <span className="text-[10px] text-gray-500">
                {teamSide} · {action.teamTricode}
              </span>
            )}
            {isScore && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded px-1.5">
                +{action.pointsTotal} 分
              </span>
            )}
          </div>

          <div className="font-bold text-gray-800 truncate">{playerName}</div>

          {/* 比賽 description */}
          {action.description && (
            <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">
              {action.description}
              {action.shotDistance !== undefined && action.shotDistance > 0 && (
                <span className="ml-1 text-gray-400">· {action.shotDistance}ft</span>
              )}
            </div>
          )}
        </div>

        {/* 即時比分 */}
        <div className="flex-shrink-0 text-center pl-2 border-l border-gray-100">
          <div className="text-[10px] text-gray-400">比分</div>
          <div className="text-base font-black tabular-nums text-gray-700">
            {action.scoreAway}-{action.scoreHome}
          </div>
        </div>
      </div>
    </div>
  );
}
