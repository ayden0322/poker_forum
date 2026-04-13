'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

type Tab = 'standings' | 'schedule' | 'players' | 'odds';

interface SportsStatsClientProps {
  sportType: string;
  sportName: string;
  sportIcon: string;
  boardSlug: string;
}

export default function SportsStatsClient({ sportType, sportName, sportIcon, boardSlug }: SportsStatsClientProps) {
  const [tab, setTab] = useState<Tab>('standings');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'standings', label: '排名' },
    { key: 'schedule', label: '賽程' },
    { key: 'players', label: '球員數據' },
    ...(sportType === 'soccer' ? [{ key: 'odds' as Tab, label: '賠率' }] : []),
  ];

  return (
    <div className="max-w-4xl mx-auto">
      {/* 頁頭 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{sportIcon}</span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{sportName}數據中心</h1>
            <p className="text-sm text-gray-500">排名、球員數據與賽事資訊</p>
          </div>
        </div>
        <Link
          href={`/board/${boardSlug}`}
          className="text-sm text-blue-500 hover:text-blue-700"
        >
          ← 返回{sportName}看板
        </Link>
      </div>

      {/* Tab 切換 */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 內容 */}
      {tab === 'standings' && <StandingsPanel sportType={sportType} />}
      {tab === 'schedule' && <SchedulePanel sportType={sportType} />}
      {tab === 'players' && <PlayersPanel sportType={sportType} />}
      {tab === 'odds' && <OddsPanel sportType={sportType} />}
    </div>
  );
}

// ============ 排名面板 ============

function StandingsPanel({ sportType }: { sportType: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sports-standings', sportType],
    queryFn: () => apiFetch<{ data: any[] }>(`/sports/${sportType}/standings`),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton />;

  const standings = data?.data ?? [];
  if (standings.length === 0) return <EmptyState text="暫無排名資料" />;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-gray-600 font-medium">排名</th>
            <th className="px-4 py-3 text-left text-gray-600 font-medium">隊伍</th>
            <th className="px-4 py-3 text-center text-gray-600 font-medium">勝</th>
            <th className="px-4 py-3 text-center text-gray-600 font-medium">負</th>
            <th className="px-4 py-3 text-center text-gray-600 font-medium">勝率</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {standings.map((item: any, idx: number) => {
            const team = item.team ?? item.group?.standings?.[0]?.team;
            const stats = item.games ?? item.all ?? item;
            return (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-500">{item.position ?? idx + 1}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {team?.logo && <img src={team.logo} alt="" className="w-5 h-5 object-contain" />}
                    <span className="font-medium text-gray-800">{team?.name ?? '未知'}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-center text-gray-700">{stats?.win?.total ?? stats?.won ?? '-'}</td>
                <td className="px-4 py-2.5 text-center text-gray-700">{stats?.lose?.total ?? stats?.lost ?? '-'}</td>
                <td className="px-4 py-2.5 text-center text-gray-700">
                  {stats?.win?.percentage ?? item.points ?? '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============ 賽程面板 ============

function SchedulePanel({ sportType }: { sportType: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sports-schedule', sportType],
    queryFn: () => apiFetch<{ data: any[] }>(`/sports/${sportType}/schedule`),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton />;

  const games = data?.data ?? [];
  if (games.length === 0) return <EmptyState text="近期暫無賽程" />;

  return (
    <div className="space-y-3">
      {games.map((game: any, idx: number) => {
        const home = game.teams?.home;
        const away = game.teams?.away;
        const date = game.fixture?.date ?? game.date ?? game.time;
        const status = game.fixture?.status?.long ?? game.status?.long ?? '';

        return (
          <div key={idx} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
              <span>{formatDate(date)}</span>
              <span>{status}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {away?.logo && <img src={away.logo} alt="" className="w-6 h-6 object-contain" />}
                <span className="font-medium text-gray-800">{away?.name ?? '未知'}</span>
              </div>
              <span className="text-xs text-gray-400 mx-2">@</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800">{home?.name ?? '未知'}</span>
                {home?.logo && <img src={home.logo} alt="" className="w-6 h-6 object-contain" />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============ 球員數據面板 ============

function PlayersPanel({ sportType }: { sportType: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sports-players', sportType],
    queryFn: () => apiFetch<{ data: any[] }>(`/sports/${sportType}/players`),
    staleTime: 60 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton />;

  const players = data?.data ?? [];
  if (players.length === 0) return <EmptyState text="暫無球員數據" />;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-gray-600 font-medium">球員</th>
            <th className="px-4 py-3 text-left text-gray-600 font-medium">隊伍</th>
            <th className="px-4 py-3 text-center text-gray-600 font-medium">位置</th>
            <th className="px-4 py-3 text-center text-gray-600 font-medium">年齡</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {players.slice(0, 50).map((item: any, idx: number) => {
            const player = item.player ?? item;
            const stats = item.statistics?.[0] ?? {};
            return (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {player.photo && <img src={player.photo} alt="" className="w-6 h-6 rounded-full object-cover" />}
                    <span className="font-medium text-gray-800">{player.name ?? player.firstname ?? '未知'}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{stats.team?.name ?? '-'}</td>
                <td className="px-4 py-2.5 text-center text-gray-600">{stats.games?.position ?? player.position ?? '-'}</td>
                <td className="px-4 py-2.5 text-center text-gray-600">{player.age ?? '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============ 賠率面板 ============

function OddsPanel({ sportType }: { sportType: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sports-odds', sportType],
    queryFn: () => apiFetch<{ data: any[] }>(`/sports/${sportType}/odds`),
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton />;

  const odds = data?.data ?? [];
  if (odds.length === 0) return <EmptyState text="暫無賠率資訊" />;

  return (
    <div className="space-y-3">
      {odds.slice(0, 20).map((item: any, idx: number) => {
        const fixture = item.fixture ?? {};
        const bookmakers = item.bookmakers ?? [];
        const firstBookmaker = bookmakers[0];
        const matchWinner = firstBookmaker?.bets?.find((b: any) => b.name === 'Match Winner');

        return (
          <div key={idx} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-xs text-gray-400 mb-2">{formatDate(fixture.date)}</div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-gray-800">{item.fixture?.homeTeam ?? '主隊'} vs {item.fixture?.awayTeam ?? '客隊'}</span>
            </div>
            {matchWinner && (
              <div className="flex gap-2">
                {matchWinner.values?.map((v: any, i: number) => (
                  <span key={i} className="px-3 py-1 bg-gray-100 rounded text-sm text-gray-700">
                    {v.value}: <span className="font-semibold">{v.odd}</span>
                  </span>
                ))}
              </div>
            )}
            {!matchWinner && firstBookmaker && (
              <p className="text-sm text-gray-400">賠率來源：{firstBookmaker.name}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============ 共用元件 ============

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-gray-100 rounded-lg h-16 animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <p className="text-lg">{text}</p>
      <p className="text-sm mt-2">資料將在 API 設定完成後顯示</p>
    </div>
  );
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleString('zh-TW', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}
