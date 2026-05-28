'use client';

import Link from 'next/link';
import type { NBALivePlayer, NBALiveTeam } from './types';

interface Props {
  awayTeam: NBALiveTeam | null;
  homeTeam: NBALiveTeam | null;
  awayPlayers: NBALivePlayer[];
  homePlayers: NBALivePlayer[];
}

const HEADSHOT = (personId: number) =>
  `https://cdn.nba.com/headshots/nba/latest/1040x760/${personId}.png`;

export function OnCourtPlayers({
  awayTeam,
  homeTeam,
  awayPlayers,
  homePlayers,
}: Props) {
  const awayOn = awayPlayers.filter((p) => p.oncourt);
  const homeOn = homePlayers.filter((p) => p.oncourt);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 text-xs text-gray-500 font-medium flex items-center justify-between">
        <span>場上球員</span>
        <span className="text-[10px] text-gray-400">即時數據</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        <TeamColumn team={awayTeam} players={awayOn} accent="text-red-600" />
        <TeamColumn team={homeTeam} players={homeOn} accent="text-blue-600" />
      </div>
    </div>
  );
}

function TeamColumn({
  team,
  players,
  accent,
}: {
  team: NBALiveTeam | null;
  players: NBALivePlayer[];
  accent: string;
}) {
  if (!team) return <div />;

  return (
    <div>
      <div className="px-4 py-2 bg-gray-50/50 text-xs font-bold text-gray-700 flex items-center justify-between border-b border-gray-100">
        <span>
          {team.shortName} <span className="text-gray-400 ml-1">{team.nameZhTw}</span>
        </span>
        <span className={`tabular-nums font-black text-base ${accent}`}>
          {team.score}
        </span>
      </div>

      {players.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-gray-400">
          目前沒有場上球員資料
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {players.map((p) => (
            <li key={p.personId} className="px-3 py-2 flex items-center gap-3">
              <Link href={`/player/nba/${p.personId}`} className="flex-shrink-0">
                <img
                  src={HEADSHOT(p.personId)}
                  alt={p.nameZhTw}
                  className="w-10 h-10 rounded-full object-cover bg-gray-100 border border-gray-200"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.opacity = '0.3';
                  }}
                />
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {p.jerseyNum && (
                    <span className="text-[10px] font-bold text-gray-400 tabular-nums">
                      #{p.jerseyNum}
                    </span>
                  )}
                  <Link
                    href={`/player/nba/${p.personId}`}
                    className="text-sm font-bold text-gray-800 hover:text-blue-600 hover:underline truncate"
                  >
                    {p.shortName ?? p.nameZhTw}
                  </Link>
                  {p.starter && (
                    <span className="text-[9px] font-bold text-amber-700 bg-amber-100 rounded px-1">
                      先
                    </span>
                  )}
                  {p.position && (
                    <span className="text-[9px] text-gray-400">{p.position}</span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5 tabular-nums flex gap-2">
                  <span>
                    <b className="text-gray-700">{p.stats.points}</b>分
                  </span>
                  <span>
                    {p.stats.rebounds}板
                  </span>
                  <span>
                    {p.stats.assists}助
                  </span>
                  {p.stats.steals > 0 && <span className="text-green-600">{p.stats.steals}抄</span>}
                  {p.stats.blocks > 0 && <span className="text-purple-600">{p.stats.blocks}帽</span>}
                  {p.stats.turnovers > 0 && <span className="text-gray-400">{p.stats.turnovers}失</span>}
                </div>
              </div>
              {/* +/- */}
              <div className="text-right flex-shrink-0">
                <div className="text-[9px] text-gray-400">+/-</div>
                <div
                  className={`text-xs font-bold tabular-nums ${
                    p.stats.plusMinus > 0
                      ? 'text-green-600'
                      : p.stats.plusMinus < 0
                      ? 'text-red-600'
                      : 'text-gray-400'
                  }`}
                >
                  {p.stats.plusMinus > 0 ? '+' : ''}
                  {p.stats.plusMinus}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
