'use client';

import type { LiveRecentPlay, LiveTeam } from './types';

interface Props {
  plays: LiveRecentPlay[];
  awayTeam: LiveTeam | null;
  homeTeam: LiveTeam | null;
}

/**
 * 事件流（最近 8 個完成打席）
 *
 * 新事件從上 slide-in；得分事件高亮金邊；出局事件灰底。
 */
export function PlayFeed({ plays, awayTeam, homeTeam }: Props) {
  if (!plays || plays.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="text-xs text-gray-500 font-medium mb-2">本場事件</div>
        <div className="text-sm text-gray-400 text-center py-4">尚未有任何打席結果</div>
      </div>
    );
  }

  // 倒序：新事件在最上面
  const sortedPlays = [...plays].reverse();

  // 事件圖示對應
  const eventIcon = (eventType?: string, hasOut?: boolean, isScoring?: boolean) => {
    if (isScoring) return { icon: '★', cls: 'bg-amber-500 text-white' };
    switch (eventType) {
      case 'home_run':
        return { icon: 'HR', cls: 'bg-red-500 text-white' };
      case 'triple':
        return { icon: '3B', cls: 'bg-purple-500 text-white' };
      case 'double':
        return { icon: '2B', cls: 'bg-blue-500 text-white' };
      case 'single':
        return { icon: '1B', cls: 'bg-green-500 text-white' };
      case 'walk':
      case 'intent_walk':
      case 'hit_by_pitch':
        return { icon: 'BB', cls: 'bg-sky-500 text-white' };
      case 'strikeout':
      case 'strikeout_double_play':
        return { icon: 'K', cls: 'bg-rose-500 text-white' };
      case 'field_out':
      case 'force_out':
      case 'grounded_into_double_play':
      case 'sac_fly':
      case 'sac_bunt':
      case 'fielders_choice':
      case 'fielders_choice_out':
        return { icon: 'OUT', cls: 'bg-gray-400 text-white' };
      default:
        return { icon: hasOut ? 'OUT' : '·', cls: hasOut ? 'bg-gray-400 text-white' : 'bg-gray-200 text-gray-700' };
    }
  };

  // 事件中文化（常見幾種）
  const eventText = (event?: string) => {
    if (!event) return '';
    const map: Record<string, string> = {
      'Home Run': '全壘打',
      'Triple': '三壘安打',
      'Double': '二壘安打',
      'Single': '一壘安打',
      'Walk': '保送',
      'Intent Walk': '故意四壞',
      'Hit By Pitch': '觸身球',
      'Strikeout': '三振',
      'Strikeout Double Play': '三振雙殺',
      'Groundout': '滾地球出局',
      'Flyout': '飛球出局',
      'Lineout': '平飛球出局',
      'Pop Out': '小飛球出局',
      'Forceout': '封殺',
      'Grounded Into DP': '滾地雙殺',
      'Sac Fly': '高飛犧牲打',
      'Sac Bunt': '犧牲觸擊',
      'Fielders Choice': '野手選擇',
      'Fielders Choice Out': '野手選擇出局',
    };
    return map[event] ?? event;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div className="text-xs text-gray-500 font-medium flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          本場事件
        </div>
        <span className="text-[10px] text-gray-400">最近 {sortedPlays.length} 筆</span>
      </div>

      <ul className="divide-y divide-gray-100 max-h-[360px] overflow-y-auto">
        {sortedPlays.map((p, idx) => {
          const isAway = p.halfInning === 'top';
          const team = isAway ? awayTeam : homeTeam;
          const { icon, cls } = eventIcon(p.eventType, p.hasOut, p.isScoringPlay);
          const batterName =
            p.batter?.shortName ?? p.batter?.nameZhTw ?? p.batter?.fullName ?? '?';
          return (
            <li
              key={p.atBatIndex ?? idx}
              className={`px-4 py-3 flex gap-3 items-start ${
                p.isScoringPlay ? 'bg-gradient-to-r from-amber-50 via-amber-50/50 to-transparent' : ''
              } ${idx === 0 ? 'mlb-play-slide' : ''}`}
            >
              {/* 局數 */}
              <div className="flex-shrink-0 text-[11px] font-bold text-gray-500 w-10 text-center pt-0.5">
                <div className="leading-none">{p.inning}</div>
                <div className="text-amber-500 leading-none mt-0.5 text-[10px]">
                  {isAway ? '↑' : '↓'}
                </div>
              </div>

              {/* 事件圖示 */}
              <div
                className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-black ${cls}`}
              >
                {icon}
              </div>

              {/* 內容 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-bold text-sm text-gray-800 truncate">
                    {batterName}
                  </span>
                  {team && (
                    <span className="text-[10px] text-gray-400">
                      {team.shortName}
                    </span>
                  )}
                  {p.event && (
                    <span
                      className={`text-xs font-medium ${
                        p.isScoringPlay ? 'text-amber-700' : 'text-gray-600'
                      }`}
                    >
                      {eventText(p.event)}
                    </span>
                  )}
                  {p.rbi > 0 && (
                    <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1.5">
                      +{p.rbi} 分打點
                    </span>
                  )}
                </div>
                {p.description && (
                  <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                    {p.description}
                  </div>
                )}
              </div>

              {/* 即時比分 */}
              <div className="flex-shrink-0 text-[11px] text-gray-400 tabular-nums pt-1">
                {p.awayScore}–{p.homeScore}
              </div>
            </li>
          );
        })}
      </ul>

      <style jsx>{`
        :global(.mlb-play-slide) {
          animation: mlbPlaySlide 0.5s ease-out;
        }
        @keyframes mlbPlaySlide {
          0% { opacity: 0; transform: translateY(-12px); background-color: rgba(251, 191, 36, 0.15); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
