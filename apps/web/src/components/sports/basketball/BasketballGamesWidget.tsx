'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useState } from 'react';

/**
 * 通用籃球三日賽事 Widget — 吃 /basketball/:league/games/recent
 *
 * 跨資料源統一：API-Sports 與 TPBL 都回 NormalizedBasketballGame。
 * 昨日 / 今日 / 明日切換；LIVE 紅框；卡片連到 /match/basketball/:league/:gameId。
 */

interface ApiTeam {
  id: number;
  name?: string;
  nameZhTw?: string | null;
  shortName?: string | null;
  logo?: string;
  score?: number | null;
}

interface ApiGame {
  id: number;
  date?: string;
  timestamp?: number;
  status?: string;
  statusShort?: string;
  venue?: string | null;
  teams?: { home?: ApiTeam; away?: ApiTeam };
}

interface RecentResponse {
  data: { yesterday: ApiGame[]; today: ApiGame[]; tomorrow: ApiGame[] };
}

type DayKey = 'yesterday' | 'today' | 'tomorrow';
const DAY_TABS: { key: DayKey; label: string }[] = [
  { key: 'yesterday', label: '昨日' },
  { key: 'today', label: '今日' },
  { key: 'tomorrow', label: '明日' },
];

const FINAL_CODES = new Set(['FT', 'AOT', 'AET']);
const LIVE_CODES = new Set(['LIVE', 'Q1', 'Q2', 'Q3', 'Q4', 'OT', 'HT', 'BT']);

function state(short?: string): 'Live' | 'Final' | 'Preview' {
  const s = (short ?? 'NS').toUpperCase();
  if (LIVE_CODES.has(s)) return 'Live';
  if (FINAL_CODES.has(s)) return 'Final';
  return 'Preview';
}

function teamName(t?: ApiTeam): string {
  if (!t) return '未知';
  return t.shortName || t.nameZhTw || t.name || '未知';
}

function twTime(ts?: number): string {
  if (!ts) return '';
  try {
    return new Date(ts * 1000).toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Taipei',
    });
  } catch {
    return '';
  }
}

function GameCard({ league, game }: { league: string; game: ApiGame }) {
  const st = state(game.statusShort);
  const home = game.teams?.home;
  const away = game.teams?.away;
  const isLive = st === 'Live';
  const isFinal = st === 'Final';

  return (
    <Link
      href={`/match/basketball/${league}/${game.id}`}
      className={`flex-shrink-0 w-56 bg-white rounded-lg border p-3 transition-shadow hover:shadow-md ${
        isLive ? 'border-red-400 ring-1 ring-red-200' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            isLive ? 'bg-red-500 text-white animate-pulse' : isFinal ? 'bg-gray-200 text-gray-600' : 'bg-blue-50 text-blue-600'
          }`}
        >
          {isLive ? '● LIVE' : isFinal ? '已結束' : twTime(game.timestamp) || '即將開打'}
        </span>
        {game.venue && <span className="text-[10px] text-gray-400 truncate max-w-[90px]">{game.venue}</span>}
      </div>

      {[away, home].map((t, i) => (
        <div key={i} className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2 min-w-0">
            {t?.logo && (
              <img
                src={t.logo}
                alt=""
                className="w-5 h-5 object-contain flex-shrink-0"
                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
              />
            )}
            <span className="text-sm text-gray-800 truncate">{teamName(t)}</span>
          </div>
          <span className={`text-sm font-bold tabular-nums ${isLive ? 'text-red-600' : 'text-gray-900'}`}>
            {t?.score ?? '-'}
          </span>
        </div>
      ))}
    </Link>
  );
}

export function BasketballGamesWidget({ league, leagueName }: { league: string; leagueName: string }) {
  const [day, setDay] = useState<DayKey>('today');
  const { data, isLoading } = useQuery({
    queryKey: ['basketball-recent', league],
    queryFn: () => apiFetch<RecentResponse>(`/basketball/${league}/games/recent`),
    staleTime: 60 * 1000,
  });

  const games = data?.data?.[day] ?? [];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
      <div className="px-3 py-2 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-white flex items-center gap-2">
        <span>🏀</span>
        <h3 className="font-bold text-gray-800 text-sm">{leagueName}賽事</h3>
        <div className="ml-auto flex gap-1">
          {DAY_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setDay(t.key)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                day === t.key ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-gray-400 text-xs">載入中...</div>
      ) : games.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-xs">這天沒有{leagueName}賽事</div>
      ) : (
        <div className="flex gap-3 overflow-x-auto p-3">
          {games.map((g) => (
            <GameCard key={g.id} league={league} game={g} />
          ))}
        </div>
      )}
    </div>
  );
}
