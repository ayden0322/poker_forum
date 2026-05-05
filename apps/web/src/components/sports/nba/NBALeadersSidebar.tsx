'use client';

/**
 * NBA 數據王 sidebar
 * 資料來源：stats.nba.com 經 /nba/leaders/{category}
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

interface Leader {
  rank: number;
  playerId: number;
  playerName: string;
  team: string;
  value: number;
  gp: number;
  nameZhTw?: string;
  nickname?: string;
  espnPlayerId?: number;
}

const CATEGORIES = [
  { key: 'PTS',     label: '得分',   suffix: '' },
  { key: 'REB',     label: '籃板',   suffix: '' },
  { key: 'AST',     label: '助攻',   suffix: '' },
  { key: 'STL',     label: '抄截',   suffix: '' },
  { key: 'BLK',     label: '阻攻',   suffix: '' },
  { key: 'FG3M',    label: '三分球', suffix: '' },
  { key: 'FG_PCT',  label: '命中率', suffix: '%' },
  { key: 'FT_PCT',  label: '罰球%',  suffix: '%' },
];

const DEFAULT_VISIBLE = 5;

export function NBALeadersSidebar() {
  const [activeCategory, setActiveCategory] = useState<string>('PTS');
  const [showAll, setShowAll] = useState(false);

  const cat = CATEGORIES.find((c) => c.key === activeCategory)!;

  const { data, isLoading } = useQuery({
    queryKey: ['nba-leaders', activeCategory],
    queryFn: () => apiFetch<{ data: Leader[] }>(`/nba/leaders/${activeCategory}?limit=10`),
    staleTime: 6 * 60 * 60 * 1000,
  });

  const leaders = data?.data ?? [];
  const visible = showAll ? leaders : leaders.slice(0, DEFAULT_VISIBLE);

  const formatValue = (v: number, suffix: string) => {
    if (v == null) return '—';
    if (suffix === '%') return (v * 100).toFixed(1) + '%';
    return Number(v).toFixed(1);
  };

  return (
    <div className="rounded-xl bg-white border border-orange-100 overflow-hidden">
      <div className="px-4 pt-3 pb-2 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100">
        <div className="flex items-center gap-2">
          <span>🏆</span>
          <span className="font-semibold text-gray-800 text-sm">NBA 數據王</span>
        </div>
      </div>

      {/* 類別切換 */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-gray-100">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => {
              setActiveCategory(c.key);
              setShowAll(false);
            }}
            className={`px-2 py-1 rounded text-[11px] font-medium transition ${
              activeCategory === c.key
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-orange-100'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="p-4 text-center text-xs text-gray-400 animate-pulse">載入中...</div>
      ) : leaders.length === 0 ? (
        <div className="p-4 text-center text-xs text-gray-400">尚無資料</div>
      ) : (
        <>
          <div className="divide-y divide-gray-50">
            {visible.map((p) => (
              <div
                key={p.playerId}
                className="grid grid-cols-12 gap-1 px-3 py-2 text-xs items-center hover:bg-orange-50 transition"
              >
                <div className="col-span-1 text-center font-bold text-gray-400">
                  {p.rank}
                </div>
                <div className="col-span-7 truncate">
                  <div className="truncate font-medium text-gray-800">
                    {p.nameZhTw ?? p.playerName}
                  </div>
                  <div className="text-[10px] text-gray-400 truncate">
                    {p.team} · {p.gp} 場
                  </div>
                </div>
                <div className="col-span-4 text-right font-mono font-bold text-orange-600">
                  {formatValue(p.value, cat.suffix)}
                </div>
              </div>
            ))}
          </div>
          {leaders.length > DEFAULT_VISIBLE && (
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-right">
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-[11px] text-orange-600 hover:text-orange-700 font-medium"
              >
                {showAll ? '收起' : `展開全部 (${leaders.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
