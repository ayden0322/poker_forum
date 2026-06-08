'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

/**
 * 通用棒球戰績排行榜 — 吃 /baseball/:league/standings（API-Sports）
 *
 * 支援 CPBL / NPB / KBO：
 *  - NPB 有「中央聯盟 / 太平洋聯盟」兩分組（row.group.name），自動分組顯示
 *  - 隊名優先用後端附加的 nameZhTw（NPB/KBO 由靜態中譯表 fallback）
 *  - 取代原 CpblStandingsWidget 的硬編碼版本
 */

interface StandingTeam {
  position: number;
  team: { id: number; name: string; logo: string; nameZhTw?: string; shortName?: string };
  group?: { name: string | null };
  games?: {
    played: number;
    win: { total: number; percentage: string };
    lose: { total: number; percentage: string };
  };
  points?: { for: number; against: number };
  form?: string;
  description?: string;
}

interface StandingsResponse {
  data: StandingTeam[] | StandingTeam[][];
}

const LEAGUE_NAMES: Record<string, string> = {
  cpbl: '中華職棒',
  npb: '日本職棒',
  kbo: '韓國職棒',
  'other-baseball': '墨西哥職棒',
};

/** 分組名稱中譯（NPB 央聯/太平洋聯盟） */
const GROUP_ZH: Record<string, string> = {
  'Central Division': '中央聯盟',
  'Pacific Division': '太平洋聯盟',
  'Central League': '中央聯盟',
  'Pacific League': '太平洋聯盟',
};

function flattenStandings(raw: StandingsResponse['data'] | undefined): StandingTeam[] {
  if (!raw) return [];
  if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0])) {
    return (raw as StandingTeam[][]).flat();
  }
  return raw as StandingTeam[];
}

function teamLabel(t: StandingTeam): string {
  return t.team.nameZhTw ?? t.team.name;
}

/** 依 group.name 分組；無分組或單一分組回傳單一群 */
function groupByDivision(rows: StandingTeam[]): { name: string | null; rows: StandingTeam[] }[] {
  const names = Array.from(new Set(rows.map((r) => r.group?.name ?? null)));
  if (names.length <= 1) return [{ name: null, rows }];
  return names.map((name) => ({
    name,
    rows: rows
      .filter((r) => (r.group?.name ?? null) === name)
      .sort((a, b) => a.position - b.position),
  }));
}

function StandingsTable({ league, rows }: { league: string; rows: StandingTeam[] }) {
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
            <th className="text-center px-2 py-2 font-medium hidden md:table-cell">近況</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const w = row.games?.win?.total ?? 0;
            const l = row.games?.lose?.total ?? 0;
            const total = w + l;
            const pct = total > 0 ? (w / total).toFixed(3) : '.000';
            const medal =
              row.position === 1
                ? 'bg-yellow-400 text-yellow-900'
                : row.position === 2
                ? 'bg-gray-300 text-gray-800'
                : row.position === 3
                ? 'bg-orange-300 text-orange-900'
                : 'bg-gray-100 text-gray-500';
            return (
              <tr
                key={row.team.id ?? idx}
                className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex w-5 h-5 rounded-full items-center justify-center text-[10px] font-bold ${medal}`}
                  >
                    {row.position ?? idx + 1}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <Link
                    href={`/team/baseball/${league}/${row.team.id}`}
                    className="flex items-center gap-2 hover:text-blue-600"
                  >
                    {row.team.logo && (
                      <img
                        src={row.team.logo}
                        alt=""
                        className="w-5 h-5 object-contain"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                      />
                    )}
                    <span className="font-medium text-gray-800">{teamLabel(row)}</span>
                  </Link>
                </td>
                <td className="text-center px-2 py-2 tabular-nums text-gray-500">{row.games?.played ?? '-'}</td>
                <td className="text-center px-2 py-2 tabular-nums font-medium text-green-700">{w}</td>
                <td className="text-center px-2 py-2 tabular-nums text-red-600">{l}</td>
                <td className="text-center px-2 py-2 tabular-nums text-blue-600 font-medium">{pct}</td>
                <td className="text-center px-2 py-2 hidden md:table-cell">
                  {row.form ? (
                    <span className="inline-flex gap-0.5 font-mono text-[10px]">
                      {row.form.split('').slice(-5).map((c, i) => (
                        <span
                          key={i}
                          className={`w-4 h-4 rounded-sm flex items-center justify-center text-white font-bold ${
                            c === 'W' ? 'bg-green-500' : c === 'L' ? 'bg-red-400' : 'bg-gray-300'
                          }`}
                        >
                          {c}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BaseballStandingsWidget({ league }: { league: string }) {
  const leagueName = LEAGUE_NAMES[league] ?? league.toUpperCase();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['baseball-standings', league],
    queryFn: () => apiFetch<StandingsResponse>(`/baseball/${league}/standings`),
    staleTime: 30 * 60 * 1000,
  });

  const rows = flattenStandings(data?.data);
  const groups = groupByDivision(rows);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
      <div className="px-3 py-2 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white flex items-center gap-2">
        <span>📊</span>
        <h3 className="font-bold text-gray-800 text-sm">{leagueName}戰績排行榜</h3>
        <span className="text-[10px] text-gray-400 ml-auto">資料來源：API-Sports</span>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-gray-400 text-xs">載入中...</div>
      ) : isError || rows.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-xs">
          目前無排名資料（本季尚未開打或資料源更新中）
        </div>
      ) : (
        groups.map((g, i) => (
          <div key={g.name ?? i}>
            {g.name && (
              <div className="px-3 py-1.5 bg-gray-50/80 border-b border-gray-100 text-xs font-medium text-blue-700">
                {GROUP_ZH[g.name] ?? g.name}
              </div>
            )}
            <StandingsTable league={league} rows={g.rows} />
          </div>
        ))
      )}
    </div>
  );
}
