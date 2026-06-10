'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

/**
 * 通用籃球戰績排行榜 — 吃 /basketball/:league/standings
 *
 * 跨資料源統一：API-Sports 與 TPBL 官方 API 都回 NormalizedStanding，同一個 widget 通吃。
 * 隊名優先用 nameZhTw（TPBL 直接是中文；API-Sports 由翻譯表附加）。
 */

interface NormalizedStanding {
  rank: number;
  team: { id: number; name: string; nameZhTw?: string | null; shortName?: string | null; logo: string };
  played: number | null;
  wins: number;
  losses: number;
  winPct: number | null;
  gamesBehind: number | null;
  streak: string | null;
  group?: string | null;
}

interface StandingsResponse {
  data: NormalizedStanding[];
}

function teamLabel(t: NormalizedStanding['team']): string {
  return t.nameZhTw ?? t.name;
}

/** 依 group 分組（無分組或單一分組回單一群） */
function groupByDivision(rows: NormalizedStanding[]): { name: string | null; rows: NormalizedStanding[] }[] {
  const names = Array.from(new Set(rows.map((r) => r.group ?? null)));
  if (names.length <= 1) return [{ name: null, rows }];
  return names.map((name) => ({
    name,
    rows: rows.filter((r) => (r.group ?? null) === name).sort((a, b) => a.rank - b.rank),
  }));
}

function StandingsTable({ league, rows }: { league: string; rows: NormalizedStanding[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 bg-gray-50 border-b border-gray-100 text-xs">
            <th className="text-left px-3 py-2 font-medium">#</th>
            <th className="text-left px-2 py-2 font-medium">球隊</th>
            <th className="text-center px-2 py-2 font-medium">場次</th>
            <th className="text-center px-2 py-2 font-medium">勝</th>
            <th className="text-center px-2 py-2 font-medium">敗</th>
            <th className="text-center px-2 py-2 font-medium">勝率</th>
            <th className="text-center px-2 py-2 font-medium hidden md:table-cell">勝差</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const pct = row.winPct != null ? row.winPct.toFixed(3) : '.000';
            const medal =
              row.rank === 1
                ? 'bg-yellow-400 text-yellow-900'
                : row.rank === 2
                ? 'bg-gray-300 text-gray-800'
                : row.rank === 3
                ? 'bg-orange-300 text-orange-900'
                : 'bg-gray-100 text-gray-500';
            return (
              <tr key={row.team.id ?? idx} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2">
                  <span className={`inline-flex w-5 h-5 rounded-full items-center justify-center text-[10px] font-bold ${medal}`}>
                    {row.rank ?? idx + 1}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <Link href={`/team/basketball/${league}/${row.team.id}`} className="flex items-center gap-2 hover:text-blue-600">
                    {row.team.logo && (
                      <img
                        src={row.team.logo}
                        alt=""
                        className="w-5 h-5 object-contain"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                      />
                    )}
                    <span className="font-medium text-gray-800">{teamLabel(row.team)}</span>
                  </Link>
                </td>
                <td className="text-center px-2 py-2 tabular-nums text-gray-500">{row.played ?? '-'}</td>
                <td className="text-center px-2 py-2 tabular-nums font-medium text-green-700">{row.wins}</td>
                <td className="text-center px-2 py-2 tabular-nums text-red-600">{row.losses}</td>
                <td className="text-center px-2 py-2 tabular-nums text-blue-600 font-medium">{pct}</td>
                <td className="text-center px-2 py-2 tabular-nums text-gray-500 hidden md:table-cell">
                  {row.gamesBehind != null && row.gamesBehind > 0 ? row.gamesBehind : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BasketballStandingsWidget({ league, leagueName }: { league: string; leagueName: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['basketball-standings', league],
    queryFn: () => apiFetch<StandingsResponse>(`/basketball/${league}/standings`),
    staleTime: 30 * 60 * 1000,
  });

  const rows = data?.data ?? [];
  const groups = groupByDivision(rows);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
      <div className="px-3 py-2 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-white flex items-center gap-2">
        <span>🏀</span>
        <h3 className="font-bold text-gray-800 text-sm">{leagueName}戰績排行榜</h3>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-gray-400 text-xs">載入中...</div>
      ) : isError || rows.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-xs">目前無排名資料（本季尚未開打或資料源更新中）</div>
      ) : (
        groups.map((g, i) => (
          <div key={g.name ?? i}>
            {g.name && (
              <div className="px-3 py-1.5 bg-gray-50/80 border-b border-gray-100 text-xs font-medium text-orange-700">
                {g.name}
              </div>
            )}
            <StandingsTable league={league} rows={g.rows} />
          </div>
        ))
      )}
    </div>
  );
}
