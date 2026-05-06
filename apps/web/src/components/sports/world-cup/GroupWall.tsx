'use client';

/**
 * Group Wall — 12 組積分榜總覽（4×3 grid）
 *
 * 核心設計目標：
 * - 12 組同時呈現，永遠不會「空表」
 * - 已開賽組高飽和、未開賽組降明度但完整顯示 4 隊
 * - 0 分用「—」，0 場才用「0」
 * - 前 2 名綠色 left bar 視覺化晉級線
 * - 點 card 展開 modal 看小組 3 場詳細結果
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useMemo, useState } from 'react';
import Link from 'next/link';

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

interface Match {
  id: number;
  matchNumber: number;
  round: string;
  group: string | null;
  kickoffAt: string;
  venue: string;
  home: { nameZh: string; flag: string | null; fifaCode: string | null };
  away: { nameZh: string; flag: string | null; fifaCode: string | null };
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'live' | 'finished';
  liveMinute: number | null;
}

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

function GroupCard({
  group,
  onClick,
}: {
  group: Group;
  onClick: () => void;
}) {
  const totalPlayed = group.rows.reduce((s, r) => s + r.played, 0);
  const matchdaysDone = Math.ceil(totalPlayed / 4); // 每組每輪 2 場 = 4 隊次出賽
  const isUnplayed = totalPlayed === 0;

  return (
    <button
      onClick={onClick}
      className={`group relative text-left rounded-sm border transition-all duration-200 overflow-hidden ${
        isUnplayed
          ? 'border-stone-300 bg-stone-50 hover:border-stone-500'
          : 'border-stone-900 bg-white hover:shadow-[6px_6px_0_0_rgba(10,20,24,0.9)] hover:-translate-x-[2px] hover:-translate-y-[2px]'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-b ${
          isUnplayed ? 'border-stone-200 bg-stone-100/60' : 'border-stone-900 bg-stone-900 text-stone-50'
        }`}
      >
        <span className="font-display font-bold text-sm tracking-[0.15em]">
          GROUP {group.groupName}
        </span>
        <span
          className={`font-mono-stadium text-[10px] tracking-wider flex items-center gap-1.5 ${
            isUnplayed ? 'text-stone-400' : 'text-amber-400'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isUnplayed ? 'bg-stone-300' : 'bg-amber-400'
            }`}
          />
          MD {matchdaysDone}/3
        </span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-stone-200/70">
        {group.rows.map((r) => {
          const advance = r.rank <= 2 && !isUnplayed;
          return (
            <div
              key={r.teamId}
              className="grid grid-cols-[20px_28px_1fr_auto_42px] items-center gap-2 px-3 py-1.5"
            >
              {/* 晉級指示條 */}
              <div className="relative h-5 flex items-center justify-center">
                {advance && (
                  <div className="absolute -left-3 top-0 bottom-0 w-1 bg-emerald-500" />
                )}
                <span
                  className={`font-mono-stadium text-[11px] ${
                    isUnplayed ? 'text-stone-400' : advance ? 'text-emerald-700 font-bold' : 'text-stone-500'
                  }`}
                >
                  {r.rank}
                </span>
              </div>

              {/* 旗 */}
              <span className="text-base leading-none">{r.flag ?? '⚪'}</span>

              {/* 隊名 + FIFA code */}
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span
                  className={`text-xs font-medium truncate ${
                    isUnplayed ? 'text-stone-500' : 'text-stone-900'
                  }`}
                >
                  {r.nameZh}
                </span>
                <span
                  className={`font-mono-stadium text-[10px] tracking-wider ${
                    isUnplayed ? 'text-stone-300' : 'text-stone-400'
                  }`}
                >
                  {r.fifaCode}
                </span>
              </div>

              {/* W-D-L */}
              <span
                className={`font-mono-stadium text-[10px] tabular-nums ${
                  isUnplayed ? 'text-stone-300' : 'text-stone-500'
                }`}
              >
                {isUnplayed ? '—' : `${r.won}-${r.drawn}-${r.lost}`}
              </span>

              {/* Pts */}
              <span
                className={`font-mono-stadium text-sm font-bold tabular-nums text-right ${
                  isUnplayed ? 'text-stone-300' : advance ? 'text-stone-900' : 'text-stone-700'
                }`}
              >
                {isUnplayed ? '—' : r.pts}
              </span>
            </div>
          );
        })}
      </div>

      {/* 未開賽 footer */}
      {isUnplayed && (
        <div className="px-3 py-1.5 bg-stone-100/60 border-t border-stone-200">
          <span className="font-mono-stadium text-[9px] text-stone-500 tracking-wider">
            ◷ KICKS OFF JUN 11
          </span>
        </div>
      )}

      {/* hover 提示 */}
      {!isUnplayed && (
        <div className="px-3 py-1.5 border-t border-stone-200 bg-stone-50/60 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="font-mono-stadium text-[9px] text-stone-700 tracking-wider">
            VIEW DETAILS →
          </span>
        </div>
      )}
    </button>
  );
}

function GroupDetailModal({
  group,
  matches,
  onClose,
}: {
  group: Group;
  matches: Match[];
  onClose: () => void;
}) {
  const groupMatches = matches
    .filter((m) => m.group === `Group ${group.groupName}`)
    .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/70 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-stone-50 max-w-2xl w-full max-h-[85vh] overflow-y-auto rounded-sm border border-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-stone-900 text-stone-50 px-5 py-3 flex items-center justify-between border-b border-stone-900">
          <span className="font-display font-bold text-lg tracking-[0.2em]">
            GROUP {group.groupName}
          </span>
          <button
            onClick={onClose}
            className="font-mono-stadium text-xs tracking-wider hover:text-amber-400 transition-colors"
          >
            CLOSE ✕
          </button>
        </div>

        {/* 完整積分表 */}
        <div className="p-5">
          <div className="font-mono-stadium text-[10px] text-stone-500 tracking-wider mb-2">
            STANDINGS
          </div>
          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="text-stone-400 border-b border-stone-200 text-[10px] font-mono-stadium tracking-wider">
                <th className="text-left py-2 pr-2">#</th>
                <th className="text-left py-2 px-2">TEAM</th>
                <th className="text-center py-2 px-1">P</th>
                <th className="text-center py-2 px-1">W</th>
                <th className="text-center py-2 px-1">D</th>
                <th className="text-center py-2 px-1">L</th>
                <th className="text-center py-2 px-1">GF</th>
                <th className="text-center py-2 px-1">GA</th>
                <th className="text-center py-2 px-1">±</th>
                <th className="text-center py-2 pl-2 text-stone-900">PTS</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((r) => {
                const advance = r.rank <= 2;
                return (
                  <tr
                    key={r.teamId}
                    className={`border-b border-stone-100 ${advance ? 'bg-emerald-50/50' : ''}`}
                  >
                    <td className="py-2 pr-2 font-mono-stadium font-bold text-stone-600">{r.rank}</td>
                    <td className="py-2 px-2">
                      <span className="flex items-center gap-2">
                        <span className="text-base">{r.flag ?? '⚪'}</span>
                        <span className="font-medium">{r.nameZh}</span>
                        <span className="font-mono-stadium text-[10px] text-stone-400">{r.fifaCode}</span>
                      </span>
                    </td>
                    <td className="text-center font-mono-stadium tabular-nums text-stone-600">{r.played}</td>
                    <td className="text-center font-mono-stadium tabular-nums text-stone-600">{r.won}</td>
                    <td className="text-center font-mono-stadium tabular-nums text-stone-600">{r.drawn}</td>
                    <td className="text-center font-mono-stadium tabular-nums text-stone-600">{r.lost}</td>
                    <td className="text-center font-mono-stadium tabular-nums text-stone-600">{r.gf}</td>
                    <td className="text-center font-mono-stadium tabular-nums text-stone-600">{r.ga}</td>
                    <td
                      className={`text-center font-mono-stadium tabular-nums ${
                        r.gd > 0 ? 'text-emerald-700' : r.gd < 0 ? 'text-red-600' : 'text-stone-600'
                      }`}
                    >
                      {r.gd > 0 ? `+${r.gd}` : r.gd}
                    </td>
                    <td className="text-center font-mono-stadium font-bold tabular-nums pl-2">{r.pts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* 場次列表 */}
          <div className="font-mono-stadium text-[10px] text-stone-500 tracking-wider mb-2">
            FIXTURES
          </div>
          <div className="space-y-1.5">
            {groupMatches.length === 0 && (
              <div className="text-xs text-stone-400 py-3 text-center">尚無賽事資料</div>
            )}
            {groupMatches.map((m) => {
              const fin = m.status === 'finished';
              const live = m.status === 'live';
              const homeWins = fin && m.homeScore != null && m.awayScore != null && m.homeScore > m.awayScore;
              const awayWins = fin && m.homeScore != null && m.awayScore != null && m.awayScore > m.homeScore;
              return (
                <Link
                  key={m.id}
                  href={`/match/world-cup/${m.matchNumber}`}
                  className="flex items-center gap-3 px-3 py-2 border border-stone-200 hover:border-stone-900 hover:bg-stone-100/50 transition-all"
                >
                  <span className="font-mono-stadium text-[9px] text-stone-400 tracking-wider w-12 flex-shrink-0">
                    {m.round.replace('Matchday ', 'MD')}
                  </span>
                  <span className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
                    <span
                      className={`text-xs truncate ${homeWins ? 'font-bold text-stone-900' : 'text-stone-700'}`}
                    >
                      {m.home.nameZh}
                    </span>
                    <span className="text-base">{m.home.flag}</span>
                  </span>
                  <span
                    className={`font-mono-stadium font-bold text-sm tabular-nums px-2.5 py-0.5 border min-w-[60px] text-center ${
                      live
                        ? 'border-red-600 bg-red-50 text-red-600'
                        : fin
                        ? 'border-stone-900 bg-stone-900 text-stone-50'
                        : 'border-stone-200 text-stone-400'
                    }`}
                  >
                    {fin || live ? `${m.homeScore} - ${m.awayScore}` : 'vs'}
                  </span>
                  <span className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-base">{m.away.flag}</span>
                    <span
                      className={`text-xs truncate ${awayWins ? 'font-bold text-stone-900' : 'text-stone-700'}`}
                    >
                      {m.away.nameZh}
                    </span>
                  </span>
                  {live && (
                    <span className="font-mono-stadium text-[9px] text-red-600 font-bold tracking-wider">
                      {m.liveMinute}'
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function GroupWall() {
  const [openGroup, setOpenGroup] = useState<Group | null>(null);

  const { data: groupsData } = useQuery({
    queryKey: ['world-cup-groups'],
    queryFn: () => apiFetch<{ data: Group[] }>('/sports/world-cup/groups'),
    staleTime: 60_000,
  });

  const { data: matchesData } = useQuery({
    queryKey: ['world-cup-all-matches'],
    queryFn: () => apiFetch<{ data: Match[] }>('/sports/world-cup/matches'),
    staleTime: 60_000,
    enabled: !!openGroup, // 只在開啟 modal 時才抓
  });

  // 確保 12 組順序齊全（即使 API 沒回某組，也填空殼）
  const groups = useMemo(() => {
    const map = new Map(groupsData?.data.map((g) => [g.groupName, g]) ?? []);
    return GROUP_LETTERS.map(
      (letter): Group =>
        map.get(letter) ?? {
          groupName: letter,
          rows: [],
        },
    );
  }, [groupsData]);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {groups.map((g) => (
          <GroupCard key={g.groupName} group={g} onClick={() => setOpenGroup(g)} />
        ))}
      </div>

      {openGroup && (
        <GroupDetailModal
          group={openGroup}
          matches={matchesData?.data ?? []}
          onClose={() => setOpenGroup(null)}
        />
      )}
    </>
  );
}
