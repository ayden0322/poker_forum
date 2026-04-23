'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Player {
  id: number;
  fullName: string;
  nameZhTw?: string;
  shortName?: string;
  nickname?: string;
  primaryNumber?: string;
  order?: number;
  position?: {
    code?: string;
    name?: string;
    abbreviation?: string;
  };
}

interface PreviewResponse {
  data: {
    gamePk: number;
    gameDate: string;
    status: { detailedState: string; abstractGameState?: string };
    teams: {
      home: { id: number; name: string; nameZhTw?: string; shortName?: string };
      away: { id: number; name: string; nameZhTw?: string; shortName?: string };
    };
    probablePitchers: {
      home: Player | null;
      away: Player | null;
    };
    lineups: {
      home: Player[];
      away: Player[];
    };
    lineupsPosted: {
      home: boolean;
      away: boolean;
    };
  } | null;
}

/** 取得球員顯示名 */
function name(p: Player | null | undefined): string {
  if (!p) return '未公布';
  return p.shortName ?? p.nameZhTw ?? p.fullName ?? '未公布';
}

/** 位置縮寫中文化 */
const POSITION_ZH: Record<string, string> = {
  P: '投',
  C: '捕',
  '1B': '一壘',
  '2B': '二壘',
  '3B': '三壘',
  SS: '游擊',
  LF: '左外',
  CF: '中外',
  RF: '右外',
  DH: '指打',
  OF: '外野',
  IF: '內野',
};

function posZh(abbr?: string): string {
  if (!abbr) return '';
  return POSITION_ZH[abbr] ?? abbr;
}

function TeamSection({
  title,
  teamId,
  pitcher,
  lineup,
  lineupPosted,
}: {
  title: string;
  teamId?: number;
  pitcher: Player | null;
  lineup: Player[];
  lineupPosted: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
        <h4 className="font-bold text-gray-800 text-sm">{title}</h4>
      </div>

      {/* 先發投手 */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="text-xs text-gray-500 mb-1">預計先發投手</div>
        {pitcher ? (
          <Link
            href={`/player/mlb/${pitcher.id}`}
            className="inline-flex items-baseline gap-2 font-semibold text-gray-900 hover:text-blue-600"
          >
            <span className="text-base">{name(pitcher)}</span>
            {pitcher.primaryNumber && (
              <span className="text-xs text-gray-400">#{pitcher.primaryNumber}</span>
            )}
          </Link>
        ) : (
          <div className="text-gray-400 text-sm">尚未公布</div>
        )}
      </div>

      {/* 先發打線 */}
      <div className="px-4 py-3">
        <div className="text-xs text-gray-500 mb-2">先發打線</div>
        {lineupPosted && lineup.length > 0 ? (
          <ol className="space-y-1">
            {lineup.map((p) => (
              <li key={p.id} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-right tabular-nums text-gray-400 font-medium">
                  {p.order}.
                </span>
                <Link
                  href={`/player/mlb/${p.id}`}
                  className="flex-1 text-gray-900 hover:text-blue-600 truncate"
                >
                  {name(p)}
                </Link>
                <span className="text-xs text-gray-500 w-12 text-right">
                  {posZh(p.position?.abbreviation)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="text-gray-400 text-sm">
            打線通常於開賽前 2~3 小時公布
          </div>
        )}
      </div>
    </div>
  );
}

export function StartingLineupCard({
  gamePk,
  awayName,
  homeName,
  awayId,
  homeId,
  isFinished,
}: {
  gamePk: number;
  awayName: string;
  homeName: string;
  awayId?: number;
  homeId?: number;
  isFinished?: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['mlb-preview', gamePk],
    queryFn: () => apiFetch<PreviewResponse>(`/mlb/games/${gamePk}/preview`),
    staleTime: 60 * 1000,
    // 已結束的比賽就不重抓
    refetchInterval: isFinished ? false : 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="animate-pulse text-gray-400 text-sm">載入先發名單...</div>
      </div>
    );
  }

  if (!data?.data) return null;

  const preview = data.data;
  const anyPitcher = preview.probablePitchers.away || preview.probablePitchers.home;
  const anyLineup = preview.lineupsPosted.away || preview.lineupsPosted.home;

  // 完全沒資料就不渲染
  if (!anyPitcher && !anyLineup) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
        <h3 className="font-bold text-gray-800">
          {isFinished ? '本場先發名單' : '賽前先發名單'}
        </h3>
        {!isFinished && !anyLineup && (
          <p className="text-xs text-gray-500 mt-0.5">
            先發投手已公布，打線等開賽前更新
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        <TeamSection
          title={`客隊 · ${awayName}`}
          teamId={awayId}
          pitcher={preview.probablePitchers.away}
          lineup={preview.lineups.away}
          lineupPosted={preview.lineupsPosted.away}
        />
        <TeamSection
          title={`主隊 · ${homeName}`}
          teamId={homeId}
          pitcher={preview.probablePitchers.home}
          lineup={preview.lineups.home}
          lineupPosted={preview.lineupsPosted.home}
        />
      </div>
    </div>
  );
}
