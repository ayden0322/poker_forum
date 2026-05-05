'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useState } from 'react';

/** 30 隊 location 城市英文 → 中文 */
const CITY_ZH: Record<string, string> = {
  Atlanta: '亞特蘭大',
  Boston: '波士頓',
  Brooklyn: '布魯克林',
  Charlotte: '夏洛特',
  Chicago: '芝加哥',
  Cleveland: '克里夫蘭',
  Dallas: '達拉斯',
  Denver: '丹佛',
  Detroit: '底特律',
  'Golden State': '金州',
  Houston: '休士頓',
  Indiana: '印第安納',
  'LA Clippers': '洛杉磯',
  'Los Angeles': '洛杉磯',
  Memphis: '曼菲斯',
  Miami: '邁阿密',
  Milwaukee: '密爾瓦基',
  Minnesota: '明尼蘇達',
  'New Orleans': '紐奧良',
  'New York': '紐約',
  'Oklahoma City': '奧克拉荷馬',
  Orlando: '奧蘭多',
  Philadelphia: '費城',
  Phoenix: '鳳凰城',
  Portland: '波特蘭',
  Sacramento: '沙加緬度',
  'San Antonio': '聖安東尼奧',
  Toronto: '多倫多',
  Utah: '猶他',
  Washington: '華盛頓',
};

/** "1st in Central Division" → "中央分區第 1" */
function translateStandingSummary(s?: string): string | undefined {
  if (!s) return s;
  const m = s.match(/^(\d+)(?:st|nd|rd|th)\s+in\s+(.+?)\s+Division$/i);
  if (m) {
    const divisionZh: Record<string, string> = {
      Atlantic: '大西洋',
      Central: '中央',
      Southeast: '東南',
      Northwest: '西北',
      Pacific: '太平洋',
      Southwest: '西南',
    };
    const div = divisionZh[m[2]] ?? m[2];
    return `${div}分區第 ${m[1]}`;
  }
  return s;
}

/** ESPN status type description → 中文 */
const STATUS_ZH: Record<string, string> = {
  'In Progress': '進行中',
  'Final': '已結束',
  'Final/OT': '已結束（延長）',
  'Scheduled': '未開始',
  'Halftime': '中場休息',
  'End of Period': '節間',
  'Postponed': '延期',
};

interface TeamData {
  id?: number;
  displayName?: string;
  nameZhTw?: string;
  shortName?: string;
  nickname?: string;
  location?: string;
  abbreviation?: string;
  color?: string;
  alternateColor?: string;
  logos?: { href: string }[];
  record?: { items?: { stats?: { name: string; value?: string | number; displayValue?: string }[]; summary?: string }[] };
  standingSummary?: string;
  venue?: { fullName?: string; address?: { city?: string; state?: string } };
  groups?: { name?: string };
}

interface RosterPlayer {
  espnId: number;
  fullName: string;
  displayName: string;
  jersey?: string;
  position?: string;
  height?: string;
  weight?: string;
  age?: number;
  experience?: number;
  college?: string;
  headshot?: string;
  nameZhTw?: string;
  nickname?: string;
}

interface ScheduleEvent {
  id: string;
  date: string;
  shortName: string;
  competitions?: {
    competitors?: {
      homeAway: 'home' | 'away';
      score?: { displayValue?: string } | string;
      team?: { id: string; abbreviation: string; displayName: string; logo?: string };
      winner?: boolean;
    }[];
    status?: { type?: { description: string; completed?: boolean; state?: string } };
  }[];
}

export default function NBATeamPageClient({ espnTeamId }: { espnTeamId: number }) {
  const [tab, setTab] = useState<'roster' | 'schedule'>('roster');

  /** 30 隊翻譯（把賽程裡的 abbreviation 換中文） */
  const { data: teamsRes } = useQuery({
    queryKey: ['nba-teams-zh'],
    queryFn: () => apiFetch<{ data: { espnId: number | string; abbreviation: string; nameZhTw: string; shortName?: string }[] }>('/nba/teams'),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const abbrToZh = new Map<string, string>();
  for (const t of teamsRes?.data ?? []) abbrToZh.set(t.abbreviation, t.shortName ?? t.nameZhTw);

  const { data: teamRes, isLoading: teamLoading } = useQuery({
    queryKey: ['nba-team', espnTeamId],
    queryFn: () => apiFetch<{ data: TeamData | null }>(`/nba/teams/${espnTeamId}`),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { data: rosterRes, isLoading: rosterLoading } = useQuery({
    queryKey: ['nba-team-roster', espnTeamId],
    queryFn: () => apiFetch<{ data: RosterPlayer[] }>(`/nba/teams/${espnTeamId}/roster`),
    staleTime: 60 * 60 * 1000,
    enabled: tab === 'roster',
  });

  const { data: scheduleRes, isLoading: scheduleLoading } = useQuery({
    queryKey: ['nba-team-schedule', espnTeamId],
    queryFn: () => apiFetch<{ data: ScheduleEvent[] }>(`/nba/teams/${espnTeamId}/schedule`),
    staleTime: 60 * 60 * 1000,
    enabled: tab === 'schedule',
  });

  const team = teamRes?.data;
  const roster = rosterRes?.data ?? [];
  const events = scheduleRes?.data ?? [];

  if (teamLoading) {
    return (
      <div className="p-6 text-center text-gray-500">
        <div className="animate-pulse">載入球隊資料中...</div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="p-6 text-center text-gray-500">
        找不到此球隊資料。
        <Link href="/board/nba" className="ml-2 text-orange-500 hover:underline">
          回 NBA 板
        </Link>
      </div>
    );
  }

  const teamName = team.nameZhTw ?? team.displayName ?? 'NBA 球隊';
  const logo = team.logos?.[0]?.href;
  const recordSummary = team.record?.items?.[0]?.summary;
  const standingSummary = team.standingSummary;
  const headerColor = team.color ? `#${team.color}` : '#ed8936';

  // 計算本季戰績資料
  const sortedEvents = [...events].sort((a, b) => (a.date > b.date ? 1 : -1));
  const completed = sortedEvents.filter((e) => e.competitions?.[0]?.status?.type?.completed);
  const upcoming = sortedEvents.filter((e) => !e.competitions?.[0]?.status?.type?.completed);

  return (
    <div className="max-w-5xl mx-auto px-4 py-4">
      {/* 麵包屑 */}
      <nav className="text-sm text-gray-500 mb-3">
        <Link href="/board/nba" className="hover:text-orange-600">NBA 板</Link>
        <span className="mx-1">/</span>
        <span>{teamName}</span>
      </nav>

      {/* Header */}
      <div
        className="rounded-xl overflow-hidden border border-gray-200 mb-4"
        style={{ borderTopColor: headerColor, borderTopWidth: 4 }}
      >
        <div className="bg-white p-5 flex items-center gap-5">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={team.abbreviation ?? ''} className="w-20 h-20 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-500 mb-1">{(team.location && CITY_ZH[team.location]) ?? team.location ?? ''}</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{teamName}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
              {team.abbreviation && (
                <span className="px-2 py-0.5 bg-gray-100 rounded font-mono text-xs">
                  {team.abbreviation}
                </span>
              )}
              {recordSummary && (
                <span className="font-semibold text-gray-800">戰績 {recordSummary}</span>
              )}
              {standingSummary && (
                <span className="text-gray-500">{translateStandingSummary(standingSummary)}</span>
              )}
              {team.venue?.fullName && (
                <span className="text-xs text-gray-500">主場：{team.venue.fullName}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab 切換 */}
      <div className="flex gap-1 mb-3 border-b border-gray-200">
        <button
          onClick={() => setTab('roster')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === 'roster'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          陣容名單
        </button>
        <button
          onClick={() => setTab('schedule')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === 'schedule'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          賽程結果
        </button>
      </div>

      {/* 陣容名單 */}
      {tab === 'roster' && (
        <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
          {rosterLoading ? (
            <div className="p-6 text-center text-gray-500 text-sm animate-pulse">載入陣容...</div>
          ) : roster.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">尚無陣容資料</div>
          ) : (
            <div className="divide-y divide-gray-100">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs text-gray-500 bg-gray-50">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-5">球員</div>
                <div className="col-span-1 text-center">位置</div>
                <div className="col-span-2 text-center">身高 / 體重</div>
                <div className="col-span-1 text-center">年齡</div>
                <div className="col-span-2 text-center">年資</div>
              </div>
              {roster.map((p) => (
                <Link
                  key={p.espnId}
                  href={`/player/nba/${p.espnId}`}
                  className="grid grid-cols-12 gap-2 px-4 py-2 text-sm items-center hover:bg-orange-50 transition"
                >
                  <div className="col-span-1 text-center font-mono text-gray-500">
                    {p.jersey ?? '-'}
                  </div>
                  <div className="col-span-5 flex items-center gap-2 min-w-0">
                    {p.headshot && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.headshot} alt="" className="w-7 h-7 rounded-full object-cover bg-gray-100 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-800">
                        {p.nameZhTw ?? p.fullName}
                      </div>
                      {p.nickname && (
                        <div className="text-[10px] text-gray-400 truncate">{p.nickname}</div>
                      )}
                    </div>
                  </div>
                  <div className="col-span-1 text-center">
                    <span className="inline-block px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded text-[10px] font-medium">
                      {p.position ?? '-'}
                    </span>
                  </div>
                  <div className="col-span-2 text-center text-xs text-gray-600">
                    {p.height ?? '-'} / {p.weight ?? '-'}
                  </div>
                  <div className="col-span-1 text-center text-xs text-gray-600">{p.age ?? '-'}</div>
                  <div className="col-span-2 text-center text-xs text-gray-600">
                    {p.experience !== undefined ? `${p.experience} 年` : '-'}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 賽程結果 */}
      {tab === 'schedule' && (
        <div className="space-y-2">
          {scheduleLoading ? (
            <div className="p-6 text-center text-gray-500 text-sm animate-pulse">載入賽程...</div>
          ) : events.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">尚無賽程資料</div>
          ) : (
            <>
              {upcoming.length > 0 && (
                <div className="rounded-xl bg-white border border-gray-200 p-3">
                  <div className="text-xs font-semibold text-gray-500 mb-2 px-1">即將比賽</div>
                  <div className="space-y-1">
                    {upcoming.slice(0, 5).map((e) => (
                      <ScheduleRow key={e.id} event={e} abbrToZh={abbrToZh} />
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-xl bg-white border border-gray-200 p-3">
                <div className="text-xs font-semibold text-gray-500 mb-2 px-1">
                  已結束（{completed.length} 場）
                </div>
                <div className="space-y-1">
                  {[...completed].reverse().slice(0, 30).map((e) => (
                    <ScheduleRow key={e.id} event={e} abbrToZh={abbrToZh} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 賽程列 */
function ScheduleRow({ event, abbrToZh }: { event: ScheduleEvent; abbrToZh: Map<string, string> }) {
  const c = event.competitions?.[0];
  const home = c?.competitors?.find((x) => x.homeAway === 'home');
  const away = c?.competitors?.find((x) => x.homeAway === 'away');
  const statusRaw = c?.status?.type?.description ?? '';
  const status = STATUS_ZH[statusRaw] ?? statusRaw;
  const completed = c?.status?.type?.completed ?? false;
  const homeAbbr = home?.team?.abbreviation;
  const awayAbbr = away?.team?.abbreviation;
  const homeZh = homeAbbr ? abbrToZh.get(homeAbbr) : undefined;
  const awayZh = awayAbbr ? abbrToZh.get(awayAbbr) : undefined;

  const homeScore = typeof home?.score === 'object' ? home.score?.displayValue : (home?.score as string);
  const awayScore = typeof away?.score === 'object' ? away.score?.displayValue : (away?.score as string);

  const dt = new Date(event.date);
  const dateStr = `${dt.getMonth() + 1}/${dt.getDate()}`;

  return (
    <div className="grid grid-cols-12 gap-2 items-center px-2 py-1.5 hover:bg-gray-50 rounded">
      <div className="col-span-2 text-xs text-gray-500">{dateStr}</div>
      <div className="col-span-4 flex items-center gap-1.5 truncate">
        {away?.team?.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={away.team.logo} alt="" className="w-4 h-4" />
        )}
        <span className={`truncate text-xs ${completed && away?.winner ? 'font-bold' : ''}`}>
          {awayZh ?? awayAbbr}
        </span>
        {completed && <span className={`ml-auto font-mono text-xs ${away?.winner ? 'font-bold' : 'text-gray-500'}`}>{awayScore}</span>}
      </div>
      <div className="col-span-1 text-center text-[10px] text-gray-400">@</div>
      <div className="col-span-4 flex items-center gap-1.5 truncate">
        {home?.team?.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={home.team.logo} alt="" className="w-4 h-4" />
        )}
        <span className={`truncate text-xs ${completed && home?.winner ? 'font-bold' : ''}`}>
          {homeZh ?? homeAbbr}
        </span>
        {completed && <span className={`ml-auto font-mono text-xs ${home?.winner ? 'font-bold' : 'text-gray-500'}`}>{homeScore}</span>}
      </div>
      <div className="col-span-1 text-right text-[10px]">
        {completed ? (
          <span className="text-gray-500">{status}</span>
        ) : (
          <span className="text-orange-600">{status}</span>
        )}
      </div>
    </div>
  );
}
