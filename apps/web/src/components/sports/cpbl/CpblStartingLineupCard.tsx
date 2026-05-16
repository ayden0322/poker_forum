'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface LineupPlayer {
  name: string;
  acnt: string;
  uniformNo: string;
  order?: number;
}

interface LineupResponse {
  success: boolean;
  data: {
    gameSno: number;
    year: number;
    kindCode: string;
    status: 'scheduled' | 'live';
    probablePitchers: {
      visiting: LineupPlayer | null;
      home: LineupPlayer | null;
    };
    lineups: {
      visiting: LineupPlayer[];
      home: LineupPlayer[];
    };
    lineupsPosted: {
      visiting: boolean;
      home: boolean;
    };
    scheduledDate?: string;
    scheduledTime?: string;
    homeTeam?: string;
    awayTeam?: string;
  } | null;
}

function PlayerLink({ p, fallbackText }: { p: LineupPlayer | null; fallbackText: string }) {
  if (!p) return <span className="text-gray-400 text-sm">{fallbackText}</span>;
  const label = p.name || `球員 ${p.acnt || '未知'}`;
  if (p.acnt) {
    return (
      <Link
        href={`/player/baseball/cpbl/${p.acnt}`}
        className="inline-flex items-baseline gap-2 font-semibold text-gray-900 hover:text-blue-600"
      >
        <span className="text-base">{label}</span>
        {p.uniformNo && <span className="text-xs text-gray-400">#{p.uniformNo}</span>}
      </Link>
    );
  }
  return (
    <span className="inline-flex items-baseline gap-2 font-semibold text-gray-900">
      <span className="text-base">{label}</span>
      {p.uniformNo && <span className="text-xs text-gray-400">#{p.uniformNo}</span>}
    </span>
  );
}

function TeamSection({
  title,
  pitcher,
  lineup,
  lineupPosted,
}: {
  title: string;
  pitcher: LineupPlayer | null;
  lineup: LineupPlayer[];
  lineupPosted: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
        <h4 className="font-bold text-gray-800 text-sm">{title}</h4>
      </div>

      <div className="px-4 py-3 border-b border-gray-100">
        <div className="text-xs text-gray-500 mb-1">預計先發投手</div>
        <PlayerLink p={pitcher} fallbackText="尚未公布" />
      </div>

      <div className="px-4 py-3">
        <div className="text-xs text-gray-500 mb-2">先發打線</div>
        {lineupPosted && lineup.length > 0 ? (
          <ol className="space-y-1">
            {lineup.map((p, idx) => (
              <li key={p.acnt || `${idx}-${p.name}`} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-right tabular-nums text-gray-400 font-medium">
                  {p.order ?? idx + 1}.
                </span>
                {p.acnt ? (
                  <Link
                    href={`/player/baseball/cpbl/${p.acnt}`}
                    className="flex-1 text-gray-900 hover:text-blue-600 truncate"
                  >
                    {p.name}
                  </Link>
                ) : (
                  <span className="flex-1 text-gray-900 truncate">{p.name}</span>
                )}
                {p.uniformNo && (
                  <span className="text-xs text-gray-400 w-10 text-right">#{p.uniformNo}</span>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <div className="text-gray-400 text-sm">先發打線通常於開賽前公布</div>
        )}
      </div>
    </div>
  );
}

export function CpblStartingLineupCard({
  gameSno,
  awayName,
  homeName,
  isFinished,
}: {
  gameSno: number;
  awayName: string;
  homeName: string;
  isFinished?: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['cpbl-lineup', gameSno],
    queryFn: () => apiFetch<LineupResponse>(`/cpbl/games/${gameSno}/lineup`),
    staleTime: 60 * 1000,
    refetchInterval: isFinished ? false : 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="animate-pulse text-gray-400 text-sm">載入先發名單...</div>
      </div>
    );
  }

  const preview = data?.data;
  if (!preview) return null;

  const anyPitcher = preview.probablePitchers.visiting || preview.probablePitchers.home;
  const anyLineup =
    preview.lineupsPosted.visiting || preview.lineupsPosted.home;

  if (!anyPitcher && !anyLineup) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-red-50 to-white">
        <h3 className="font-bold text-gray-800">
          {isFinished || preview.status === 'live' ? '本場先發名單' : '賽前先發名單'}
        </h3>
        {!isFinished && !anyLineup && (
          <p className="text-xs text-gray-500 mt-0.5">
            先發投手已公布，打線等開賽前更新
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        <TeamSection
          title={`客隊 · ${preview.awayTeam || awayName}`}
          pitcher={preview.probablePitchers.visiting}
          lineup={preview.lineups.visiting}
          lineupPosted={preview.lineupsPosted.visiting}
        />
        <TeamSection
          title={`主隊 · ${preview.homeTeam || homeName}`}
          pitcher={preview.probablePitchers.home}
          lineup={preview.lineups.home}
          lineupPosted={preview.lineupsPosted.home}
        />
      </div>
    </div>
  );
}
