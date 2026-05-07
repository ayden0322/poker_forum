'use client';

/**
 * 世界盃活動條 — 看板頂部 widget
 *
 * 內容：
 * - 漸層藍 hero：標題 + 倒數 / LIVE 數
 * - LIVE NOW 4 場小卡（沒 LIVE 時改顯示「即將開賽」）
 * - 12 組 mini grid（預設顯示 4 組，可展開全 12 組）
 *
 * 用於：/board/world-cup 看板頁
 */

import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useEffect, useState } from 'react';

const KICKOFF_UTC = new Date('2026-06-11T19:00:00Z');

interface TeamView {
  fifaCode: string | null;
  nameZh: string;
  flag: string | null;
  isPlaceholder: boolean;
}
interface Match {
  id: number;
  matchNumber: number;
  group: string | null;
  round: string;
  kickoffAt: string;
  venue: string;
  home: TeamView;
  away: TeamView;
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'live' | 'finished';
  liveMinute: number | null;
}
interface Row {
  rank: number;
  teamId: number;
  fifaCode: string;
  nameZh: string;
  flag: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pts: number;
}
interface Group {
  groupName: string;
  rows: Row[];
}

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

function useCountdown(target: Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, target.getTime() - now);
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    started: diff === 0,
  };
}

function MiniGroupCard({ group }: { group: Group }) {
  const totalPlayed = group.rows.reduce((s, r) => s + r.played, 0);
  const isUnplayed = totalPlayed === 0;
  return (
    <div
      className={`rounded-lg border ${
        isUnplayed ? 'border-gray-200 bg-gray-50/60' : 'border-blue-200 bg-white'
      } overflow-hidden`}
    >
      <div
        className={`flex items-center justify-between px-2 py-1 text-[10px] font-bold tracking-wider ${
          isUnplayed ? 'bg-gray-100 text-gray-500' : 'bg-blue-600 text-white'
        }`}
      >
        <span>{group.groupName} 組</span>
        <span>{isUnplayed ? '未開賽' : `第 ${Math.ceil(totalPlayed / 4)} 輪`}</span>
      </div>
      <div className="divide-y divide-gray-100">
        {group.rows.length === 0 ? (
          <div className="px-2 py-3 text-[10px] text-gray-400 text-center">—</div>
        ) : (
          group.rows.map((r) => {
            const advance = r.rank <= 2 && !isUnplayed;
            return (
              <div
                key={r.teamId}
                className="grid grid-cols-[14px_18px_1fr_24px] items-center gap-1 px-2 py-1"
              >
                <span
                  className={`text-[9px] tabular-nums ${
                    advance ? 'text-emerald-600 font-bold' : 'text-gray-400'
                  }`}
                >
                  {r.rank}
                </span>
                <span className="text-xs leading-none">{r.flag}</span>
                <span
                  className={`text-[10px] truncate ${isUnplayed ? 'text-gray-400' : 'text-gray-800'}`}
                >
                  {r.nameZh}
                </span>
                <span
                  className={`text-[10px] tabular-nums text-right font-bold ${
                    isUnplayed ? 'text-gray-300' : advance ? 'text-blue-700' : 'text-gray-600'
                  }`}
                >
                  {isUnplayed ? '—' : r.pts}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function WorldCupActivityStrip() {
  const cd = useCountdown(KICKOFF_UTC);
  const [groupsExpanded, setGroupsExpanded] = useState(false);

  const { data: liveData } = useQuery({
    queryKey: ['wc-strip-live'],
    queryFn: () => apiFetch<{ data: Match[] }>('/sports/world-cup/matches?status=live'),
    refetchInterval: 30_000,
  });

  const { data: scheduledData } = useQuery({
    queryKey: ['wc-strip-scheduled'],
    queryFn: () => apiFetch<{ data: Match[] }>('/sports/world-cup/matches?status=scheduled'),
  });

  const { data: groupsData } = useQuery({
    queryKey: ['wc-strip-groups'],
    queryFn: () => apiFetch<{ data: Group[] }>('/sports/world-cup/groups'),
  });

  const live = liveData?.data ?? [];
  const upcoming =
    scheduledData?.data.filter((m) => !m.home.isPlaceholder && !m.away.isPlaceholder).slice(0, 4) ?? [];
  const groupMap = new Map(groupsData?.data.map((g) => [g.groupName, g]) ?? []);
  const orderedGroups: Group[] = GROUP_LETTERS.map(
    (l) => groupMap.get(l) ?? { groupName: l, rows: [] },
  );
  const previewGroups = groupsExpanded ? orderedGroups : orderedGroups.slice(0, 4);

  return (
    <div className="mb-4 rounded-xl overflow-hidden border-2 border-blue-200 bg-gradient-to-br from-blue-50 via-white to-blue-50/50 shadow-sm">
      <div className="relative bg-gradient-to-r from-blue-700 via-blue-800 to-blue-900 text-white px-4 py-3 overflow-hidden">
        <div className="absolute -right-4 -bottom-4 text-7xl opacity-10 pointer-events-none">🏆</div>
        <div className="relative flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <Image
              src="/images/world-cup/trophy.png"
              alt=""
              width={32}
              height={32}
              className="w-8 h-8 object-contain drop-shadow"
            />
            <div>
              <div className="font-bold text-base flex items-center gap-2">
                FIFA 世界盃 2026
                <span className="text-[10px] bg-amber-400 text-blue-900 px-1.5 py-0.5 rounded-full font-black tracking-wider">
                  HOT
                </span>
              </div>
              <div className="text-xs text-blue-100">美 / 加 / 墨 聯合主辦 · 6/11 — 7/19</div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {!cd.started && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-blue-200">距離開幕</span>
                <span className="font-mono tabular-nums font-bold text-amber-300 text-lg">
                  {cd.days}
                </span>
                <span className="text-blue-200 text-[10px]">天</span>
                <span className="font-mono tabular-nums font-bold text-amber-300">
                  {String(cd.hours).padStart(2, '0')}
                </span>
                <span className="text-blue-200 text-[10px]">時</span>
              </div>
            )}
            {live.length > 0 && (
              <div className="flex items-center gap-1.5 bg-red-500 px-2 py-1 rounded-full text-xs font-bold">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                {live.length} LIVE
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-3">
        {live.length > 0 ? (
          <>
            <div className="text-[10px] font-bold tracking-wider text-red-600 mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              LIVE NOW
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {live.slice(0, 4).map((m) => (
                <Link
                  key={m.id}
                  href={`/match/world-cup/${m.matchNumber}`}
                  className="block rounded-lg border-2 border-red-300 bg-white p-2 hover:border-red-500 transition-colors"
                >
                  <div className="text-[9px] text-gray-400 mb-1 truncate">
                    {m.group} · {m.round}
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 truncate">
                        <span className="text-sm">{m.home.flag}</span>
                        <span className="text-xs truncate">{m.home.nameZh}</span>
                      </span>
                      <span className="font-bold text-sm tabular-nums text-red-600">{m.homeScore}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 truncate">
                        <span className="text-sm">{m.away.flag}</span>
                        <span className="text-xs truncate">{m.away.nameZh}</span>
                      </span>
                      <span className="font-bold text-sm tabular-nums text-red-600">{m.awayScore}</span>
                    </div>
                  </div>
                  <div className="mt-1 text-[9px] text-red-600 font-bold flex items-center gap-1">
                    <span className="w-1 h-1 bg-red-500 rounded-full animate-pulse" />
                    LIVE {m.liveMinute}'
                  </div>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="text-[10px] font-bold tracking-wider text-blue-600 mb-2">即將開賽</div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {upcoming.map((m) => (
                <Link
                  key={m.id}
                  href={`/match/world-cup/${m.matchNumber}`}
                  className="block rounded-lg border border-gray-200 bg-white p-2 hover:border-blue-400 transition-colors"
                >
                  <div className="text-[9px] text-gray-400 mb-1">
                    {m.group ? `${m.group} · ` : ''}
                    {new Date(m.kickoffAt).toLocaleString('zh-TW', {
                      timeZone: 'Asia/Taipei',
                      month: '2-digit',
                      day: '2-digit',
                    })}
                  </div>
                  <div className="text-xs flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1 truncate">
                      <span>{m.home.flag}</span>
                      <span className="truncate">{m.home.nameZh}</span>
                    </span>
                    <span className="text-gray-300 text-[10px]">vs</span>
                    <span className="flex items-center gap-1 truncate">
                      <span className="truncate">{m.away.nameZh}</span>
                      <span>{m.away.flag}</span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="mt-3 pt-3 border-t border-blue-100">
          <button
            onClick={() => setGroupsExpanded((v) => !v)}
            className="w-full flex items-center justify-between text-[10px] font-bold tracking-wider text-blue-600 mb-2 hover:text-blue-700"
          >
            <span>12 組積分榜總覽</span>
            <span className="text-gray-400">{groupsExpanded ? '收起 ▴' : '展開 12 組 ▾'}</span>
          </button>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
            {previewGroups.map((g) => (
              <MiniGroupCard key={g.groupName} group={g} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
