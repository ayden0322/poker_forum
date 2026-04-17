'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useState } from 'react';

interface Leader {
  rank: number;
  value: string;
  player: {
    id: number;
    nameEn: string;
    nameZhTw: string;
    shortName?: string;
  };
  team: {
    id: number;
    nameEn: string;
  };
}

interface Response {
  data: Leader[];
}

const LEADERBOARDS = [
  { key: 'homeRuns',         label: '全壘打',  shortLabel: '全壘打', unit: '轟' },
  { key: 'battingAverage',   label: '打擊率',  shortLabel: '打擊率', unit: '' },
  { key: 'runsBattedIn',     label: '打點',    shortLabel: '打點',   unit: '分' },
  { key: 'stolenBases',      label: '盜壘',    shortLabel: '盜壘',   unit: '盜' },
  { key: 'earnedRunAverage', label: '防禦率',  shortLabel: '防禦率', unit: '' },
  { key: 'strikeouts',       label: '三振',    shortLabel: '三振',   unit: 'K' },
  { key: 'wins',             label: '勝投',    shortLabel: '勝投',   unit: '勝' },
  { key: 'saves',            label: '救援',    shortLabel: '救援',   unit: '救援' },
];

/** 預設顯示筆數 */
const DEFAULT_VISIBLE = 5;

export function LeadersSidebar() {
  const [expanded, setExpanded] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('homeRuns');
  const [showAll, setShowAll] = useState(false);
  const currentConfig = LEADERBOARDS.find((b) => b.key === activeCategory)!;

  const { data, isLoading } = useQuery({
    queryKey: ['mlb-leaders', activeCategory],
    queryFn: () => apiFetch<Response>(`/mlb/leaders/${activeCategory}?limit=10`),
    staleTime: 60 * 60 * 1000, // 1 小時
    enabled: expanded, // 只有展開時才載入
  });

  const leaders = data?.data ?? [];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* 標題列（可點擊展開/收起） */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <span>🏆</span>
          <span>MLB 數據排行榜</span>
        </span>
        <span className="text-xs text-gray-400">
          {expanded ? '▲ 收起' : '▼ 展開'}
        </span>
      </button>

      {/* 展開內容 */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          {/* 類別切換 */}
          <div className="flex flex-wrap gap-1 py-2">
            {LEADERBOARDS.map((b) => (
              <button
                key={b.key}
                onClick={() => {
                  setActiveCategory(b.key);
                  setShowAll(false);
                }}
                className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                  activeCategory === b.key
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {b.shortLabel}
              </button>
            ))}
          </div>

          {/* 排行榜 */}
          {isLoading ? (
            <div className="text-center py-4 text-gray-400 text-xs">載入中...</div>
          ) : leaders.length === 0 ? (
            <div className="text-center py-4 text-gray-400 text-xs">暫無資料</div>
          ) : (
            <>
              <ol className="space-y-1">
                {(showAll ? leaders : leaders.slice(0, DEFAULT_VISIBLE)).map((leader) => (
                  <li key={`${leader.rank}-${leader.player.id}`} className="flex items-center gap-2 text-xs">
                    <span
                      className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        leader.rank <= 3
                          ? leader.rank === 1
                            ? 'bg-yellow-400 text-yellow-900'
                            : leader.rank === 2
                            ? 'bg-gray-300 text-gray-800'
                            : 'bg-orange-300 text-orange-900'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {leader.rank}
                    </span>
                    <Link
                      href={`/player/mlb/${leader.player.id}`}
                      className="flex-1 min-w-0 hover:text-blue-600 transition-colors flex items-center gap-1.5"
                    >
                      <span className="font-medium text-gray-800 truncate">
                        {leader.player.shortName ?? leader.player.nameZhTw}
                      </span>
                      <span className="text-[10px] text-gray-400 truncate">
                        {leader.team.nameEn}
                      </span>
                    </Link>
                    <span className="font-bold text-blue-600 tabular-nums shrink-0 text-xs">
                      {leader.value}
                      {currentConfig.unit && <span className="text-[10px] text-gray-400 ml-0.5">{currentConfig.unit}</span>}
                    </span>
                  </li>
                ))}
              </ol>
              {leaders.length > DEFAULT_VISIBLE && (
                <button
                  onClick={() => setShowAll((prev) => !prev)}
                  className="w-full text-center text-[11px] text-blue-500 hover:text-blue-700 transition-colors mt-1.5 py-1 rounded hover:bg-blue-50"
                >
                  {showAll ? '收起 ▲' : '查看更多 ▼'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
