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
  { key: 'homeRuns', label: '全壘打榜', icon: '💣', unit: '轟' },
  { key: 'battingAverage', label: '打擊率榜', icon: '🎯', unit: '' },
  { key: 'runsBattedIn', label: '打點榜', icon: '🏆', unit: '分' },
  { key: 'stolenBases', label: '盜壘榜', icon: '⚡', unit: '盜' },
  { key: 'earnedRunAverage', label: '防禦率榜', icon: '🛡️', unit: '' },
  { key: 'strikeouts', label: '三振榜', icon: '🔥', unit: 'K' },
  { key: 'wins', label: '勝投榜', icon: '✅', unit: '勝' },
  { key: 'saves', label: '救援榜', icon: '🚨', unit: '救援' },
];

export function LeadersSidebar() {
  const [activeCategory, setActiveCategory] = useState<string>('homeRuns');
  const currentConfig = LEADERBOARDS.find((b) => b.key === activeCategory)!;

  const { data, isLoading } = useQuery({
    queryKey: ['mlb-leaders', activeCategory],
    queryFn: () => apiFetch<Response>(`/sports/mlb/leaders/${activeCategory}?limit=10`),
    staleTime: 60 * 60 * 1000, // 1 小時
  });

  const leaders = data?.data ?? [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
        <span>{currentConfig.icon}</span>
        <span>MLB {currentConfig.label}</span>
      </h3>

      {/* 類別切換 */}
      <div className="flex flex-wrap gap-1 mb-3 pb-3 border-b border-gray-100">
        {LEADERBOARDS.map((b) => (
          <button
            key={b.key}
            onClick={() => setActiveCategory(b.key)}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              activeCategory === b.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {b.icon}
          </button>
        ))}
      </div>

      {/* 排行榜 */}
      {isLoading ? (
        <div className="text-center py-6 text-gray-400 text-sm">載入中...</div>
      ) : leaders.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">暫無資料</div>
      ) : (
        <ol className="space-y-2">
          {leaders.map((leader) => (
            <li key={`${leader.rank}-${leader.player.id}`} className="flex items-center gap-2 text-sm">
              <span
                className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
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
                className="flex-1 min-w-0 hover:text-blue-600 transition-colors"
              >
                <div className="font-medium text-gray-800 truncate">
                  {leader.player.shortName ?? leader.player.nameZhTw}
                </div>
                <div className="text-xs text-gray-400 truncate">{leader.team.nameEn}</div>
              </Link>
              <span className="font-bold text-blue-600 tabular-nums shrink-0">
                {leader.value}
                {currentConfig.unit && <span className="text-xs text-gray-400 ml-0.5">{currentConfig.unit}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="text-[10px] text-gray-400 text-center mt-3 pt-3 border-t border-gray-100">
        資料來源：MLB 官方
      </div>
    </div>
  );
}
