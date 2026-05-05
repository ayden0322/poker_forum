'use client';

/**
 * NBA 排行榜 Widget
 * 資料來源：ESPN（透過 /nba/standings）
 * 功能：東西區 Tab 切換、季後賽種子 highlight、可展開全部
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useState } from 'react';

interface StandingTeam {
  rank: number;
  espnTeamId: number;
  abbreviation: string;
  displayName: string;
  nameZhTw: string;
  shortName?: string;
  logo?: string;
  wins: number;
  losses: number;
  winPercent?: string;
  gamesBehind?: string;
  streak?: string;
  playoffSeed?: string;
  pointDifferential?: string;
  home?: string;
  road?: string;
  lastTen?: string;
  clincher?: string;
}

interface StandingsResponse {
  data: { east: StandingTeam[]; west: StandingTeam[] };
}

const DEFAULT_VISIBLE = 8;

export function NBAStandingsWidget() {
  const [conference, setConference] = useState<'east' | 'west'>('east');
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['nba-standings'],
    queryFn: () => apiFetch<StandingsResponse>('/nba/standings'),
    staleTime: 60 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 p-4">
        <div className="text-orange-600 text-sm animate-pulse">載入 NBA 排行榜中...</div>
      </div>
    );
  }

  if (isError || !data) return null;

  const teams = data.data[conference] ?? [];
  if (teams.length === 0) return null;

  const visible = showAll ? teams : teams.slice(0, DEFAULT_VISIBLE);

  // 季後賽種子顏色：1-6 直接季後賽、7-10 play-in、11+ 無
  const seedColor = (seed?: string) => {
    const s = seed ? parseInt(seed, 10) : 99;
    if (s >= 1 && s <= 6) return 'bg-orange-100 text-orange-700 border-orange-300';
    if (s >= 7 && s <= 10) return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    return 'bg-gray-50 text-gray-500 border-gray-200';
  };

  return (
    <div className="rounded-xl bg-white border border-orange-100 overflow-hidden">
      {/* 標題 + Conference Tab */}
      <div className="px-4 pt-3 pb-2 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>🏀</span>
            <span className="font-semibold text-gray-800">NBA 排行榜</span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setConference('east')}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                conference === 'east'
                  ? 'bg-orange-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-orange-100'
              }`}
            >
              東區
            </button>
            <button
              onClick={() => setConference('west')}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                conference === 'west'
                  ? 'bg-orange-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-orange-100'
              }`}
            >
              西區
            </button>
          </div>
        </div>
      </div>

      {/* 表頭 */}
      <div className="grid grid-cols-12 gap-1 px-3 py-2 text-[11px] text-gray-500 bg-gray-50 border-b border-gray-100">
        <div className="col-span-1 text-center">#</div>
        <div className="col-span-4">球隊</div>
        <div className="col-span-2 text-center">勝-敗</div>
        <div className="col-span-2 text-center">勝率</div>
        <div className="col-span-1 text-center">勝差</div>
        <div className="col-span-2 text-center">近10/連勝</div>
      </div>

      {/* 球隊列表 */}
      <div>
        {visible.map((t) => {
          const seedNum = t.playoffSeed ? parseInt(t.playoffSeed, 10) : null;
          const isPlayoff = seedNum !== null && seedNum >= 1 && seedNum <= 6;
          const isPlayIn = seedNum !== null && seedNum >= 7 && seedNum <= 10;
          return (
            <Link
              key={t.espnTeamId}
              href={`/team/nba/${t.espnTeamId}`}
              className={`grid grid-cols-12 gap-1 px-3 py-2 text-xs items-center hover:bg-orange-50 transition border-b border-gray-50 last:border-b-0 ${
                isPlayoff ? 'bg-orange-50/30' : isPlayIn ? 'bg-yellow-50/30' : ''
              }`}
            >
              <div className={`col-span-1 text-center`}>
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold border ${seedColor(
                    t.playoffSeed,
                  )}`}
                >
                  {t.playoffSeed ?? t.rank}
                </span>
              </div>
              <div className="col-span-4 flex items-center gap-2 truncate">
                {t.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.logo} alt={t.abbreviation} className="w-5 h-5 flex-shrink-0" />
                )}
                <span className="truncate font-medium text-gray-800">
                  {t.shortName ?? t.nameZhTw}
                </span>
              </div>
              <div className="col-span-2 text-center font-mono text-gray-700">
                {t.wins}-{t.losses}
              </div>
              <div className="col-span-2 text-center font-mono text-gray-600">
                {t.winPercent ?? '—'}
              </div>
              <div className="col-span-1 text-center font-mono text-gray-500">
                {t.gamesBehind ?? '-'}
              </div>
              <div className="col-span-2 text-center text-[11px]">
                <span className="text-gray-500">{t.lastTen ?? '—'}</span>
                {t.streak && (
                  <span
                    className={`ml-1 font-medium ${
                      t.streak.startsWith('W') ? 'text-green-600' : 'text-red-500'
                    }`}
                  >
                    {t.streak}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* 展開/收起 + 圖例 */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-orange-100 border border-orange-300" />
              季後賽 1-6
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-yellow-50 border border-yellow-200" />
              附加賽 7-10
            </span>
          </div>
          {teams.length > DEFAULT_VISIBLE && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs text-orange-600 hover:text-orange-700 font-medium"
            >
              {showAll ? '收起' : `展開全部 (${teams.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
