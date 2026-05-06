'use client';

/**
 * 世界盃 12 組積分榜 — Tab 切換顯示各組
 * 資料來源：/sports/world-cup/groups
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

interface Row {
  rank: number;
  teamId: number;
  fifaCode: string;
  nameEn: string;
  nameZh: string;
  flag: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

interface Group {
  groupName: string;
  rows: Row[];
}

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export function WorldCupGroupsPanel() {
  const [activeGroup, setActiveGroup] = useState('A');

  const { data, isLoading } = useQuery({
    queryKey: ['world-cup-groups'],
    queryFn: () => apiFetch<{ data: Group[] }>('/sports/world-cup/groups'),
    staleTime: 60_000,
  });

  const groups = data?.data ?? [];
  const current = groups.find((g) => g.groupName === activeGroup);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2">
          <span className="text-base">📊</span>
          小組積分榜
        </h3>
        <div className="flex flex-wrap gap-1">
          {GROUP_LETTERS.map((g) => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                activeGroup === g
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-4 text-xs text-gray-400">載入中...</div>
      ) : !current ? (
        <div className="text-center py-4 text-xs text-gray-400">無資料</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-100">
              <th className="text-left py-1.5 px-2 font-normal">#</th>
              <th className="text-left py-1.5 px-2 font-normal">隊伍</th>
              <th className="text-center py-1.5 px-1 font-normal" title="場次">場</th>
              <th className="text-center py-1.5 px-1 font-normal" title="勝">勝</th>
              <th className="text-center py-1.5 px-1 font-normal" title="平">平</th>
              <th className="text-center py-1.5 px-1 font-normal" title="負">負</th>
              <th className="text-center py-1.5 px-1 font-normal" title="進球">進</th>
              <th className="text-center py-1.5 px-1 font-normal" title="失球">失</th>
              <th className="text-center py-1.5 px-1 font-normal" title="淨勝球">±</th>
              <th className="text-center py-1.5 px-2 font-bold text-blue-600" title="積分">分</th>
            </tr>
          </thead>
          <tbody>
            {current.rows.map((r) => {
              const advance = r.rank <= 2; // 前 2 名晉級（簡化規則）
              return (
                <tr key={r.teamId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="py-1.5 px-2">
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${
                        advance ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {r.rank}
                    </span>
                  </td>
                  <td className="py-1.5 px-2">
                    <span className="flex items-center gap-1.5">
                      <span className="text-base leading-none">{r.flag ?? '⚪'}</span>
                      <span className="font-medium text-gray-800">{r.nameZh}</span>
                    </span>
                  </td>
                  <td className="text-center tabular-nums text-gray-600">{r.played}</td>
                  <td className="text-center tabular-nums text-gray-600">{r.won}</td>
                  <td className="text-center tabular-nums text-gray-600">{r.drawn}</td>
                  <td className="text-center tabular-nums text-gray-600">{r.lost}</td>
                  <td className="text-center tabular-nums text-gray-600">{r.gf}</td>
                  <td className="text-center tabular-nums text-gray-600">{r.ga}</td>
                  <td className={`text-center tabular-nums ${r.gd > 0 ? 'text-green-600' : r.gd < 0 ? 'text-red-500' : 'text-gray-600'}`}>
                    {r.gd > 0 ? `+${r.gd}` : r.gd}
                  </td>
                  <td className="text-center tabular-nums font-bold text-blue-600">{r.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="text-[10px] text-gray-400 mt-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-green-200" /> 晉級 16 強
        </span>
        <span>·</span>
        <span>同分序：積分 → 淨勝球 → 進球數</span>
      </div>
    </div>
  );
}
