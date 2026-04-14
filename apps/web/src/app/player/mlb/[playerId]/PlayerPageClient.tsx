'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

interface PlayerData {
  id: number;
  fullName: string;
  nameZhTw: string;
  shortName?: string;
  nickname?: string;
  primaryNumber?: string;
  birthDate?: string;
  birthCountry?: string;
  height?: string;
  weight?: number;
  primaryPosition?: { name: string; abbreviation: string };
  batSide?: { description: string };
  pitchHand?: { description: string };
  mlbDebutDate?: string;
  currentTeam?: { id: number; name: string };
  draftYear?: number;
}

interface StatsResponse {
  data: {
    hitting: Record<string, any> | null;
    pitching: Record<string, any> | null;
  };
}

/** 打擊統計欄位（台灣慣用縮寫） */
const HITTING_LABELS: Array<{ key: string; label: string; format?: (v: any) => string }> = [
  { key: 'gamesPlayed', label: '出賽', format: (v) => String(v ?? '-') },
  { key: 'atBats', label: '打數' },
  { key: 'hits', label: '安打' },
  { key: 'homeRuns', label: '全壘打' },
  { key: 'rbi', label: '打點' },
  { key: 'runs', label: '得分' },
  { key: 'doubles', label: '二壘安打' },
  { key: 'triples', label: '三壘安打' },
  { key: 'stolenBases', label: '盜壘' },
  { key: 'baseOnBalls', label: '保送' },
  { key: 'strikeOuts', label: '三振' },
  { key: 'avg', label: '打擊率', format: (v) => v ?? '-' },
  { key: 'obp', label: '上壘率', format: (v) => v ?? '-' },
  { key: 'slg', label: '長打率', format: (v) => v ?? '-' },
  { key: 'ops', label: 'OPS', format: (v) => v ?? '-' },
];

/** 投手統計欄位 */
const PITCHING_LABELS: Array<{ key: string; label: string }> = [
  { key: 'gamesPlayed', label: '出賽' },
  { key: 'gamesStarted', label: '先發' },
  { key: 'wins', label: '勝' },
  { key: 'losses', label: '敗' },
  { key: 'saves', label: '救援' },
  { key: 'holds', label: '中繼' },
  { key: 'inningsPitched', label: '投球局數' },
  { key: 'strikeOuts', label: '三振' },
  { key: 'baseOnBalls', label: '保送' },
  { key: 'hits', label: '被安打' },
  { key: 'homeRuns', label: '被全壘打' },
  { key: 'earnedRuns', label: '自責分' },
  { key: 'era', label: '防禦率' },
  { key: 'whip', label: 'WHIP' },
];

function StatsTable({ stats, labels, title }: { stats: any; labels: typeof HITTING_LABELS; title: string }) {
  if (!stats) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <h3 className="text-lg font-bold mb-3 text-gray-800">{title}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {labels.map(({ key, label, format }) => {
          const val = stats[key];
          const display = format ? format(val) : val ?? '-';
          return (
            <div key={key} className="text-center">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className="text-lg font-bold text-gray-900 tabular-nums">{display}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PlayerPageClient({ player }: { player: PlayerData }) {
  // 本季數據
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['mlb-player-stats', player.id],
    queryFn: () => apiFetch<StatsResponse>(`/sports/mlb/players/${player.id}/stats`),
    staleTime: 60 * 60 * 1000, // 1 小時
  });

  const hitting = statsData?.data.hitting;
  const pitching = statsData?.data.pitching;

  // 判斷 pitcher 還是 batter（看哪個 stat 有資料）
  const isPitcher = pitching && Object.keys(pitching).length > 0;
  const isBatter = hitting && Object.keys(hitting).length > 0;

  return (
    <div className="max-w-4xl mx-auto">
      {/* 麵包屑 */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        <Link href="/" className="hover:text-blue-600">首頁</Link>
        <span>/</span>
        <Link href="/board/mlb" className="hover:text-blue-600">MLB</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{player.nameZhTw}</span>
      </nav>

      {/* 球員頭卡 */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white rounded-2xl p-6 mb-4 shadow-lg">
        <div className="flex items-start gap-6 flex-wrap">
          {/* 頭像（用 MLB 官方頭像 URL） */}
          <div className="w-32 h-32 rounded-2xl bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
            <img
              src={`https://img.mlbstatic.com/mlb-photos/image/upload/w_240,q_auto:best/v1/people/${player.id}/headshot/67/current`}
              alt={player.nameZhTw}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold mb-1">
              {player.nameZhTw}
              {player.primaryNumber && (
                <span className="ml-3 text-2xl text-blue-200">#{player.primaryNumber}</span>
              )}
            </h1>
            <div className="text-blue-200 text-sm mb-3">
              {player.fullName}
              {player.nickname && (
                <span className="ml-2 bg-white/10 px-2 py-0.5 rounded text-xs">「{player.nickname}」</span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {player.currentTeam && (
                <div>
                  <div className="text-blue-200 text-xs">目前球隊</div>
                  <div className="font-medium">{player.currentTeam.name}</div>
                </div>
              )}
              {player.primaryPosition && (
                <div>
                  <div className="text-blue-200 text-xs">守備位置</div>
                  <div className="font-medium">{player.primaryPosition.name} ({player.primaryPosition.abbreviation})</div>
                </div>
              )}
              {player.birthDate && (
                <div>
                  <div className="text-blue-200 text-xs">生日</div>
                  <div className="font-medium">{player.birthDate}</div>
                </div>
              )}
              {player.birthCountry && (
                <div>
                  <div className="text-blue-200 text-xs">國籍</div>
                  <div className="font-medium">{player.birthCountry}</div>
                </div>
              )}
              {(player.height || player.weight) && (
                <div>
                  <div className="text-blue-200 text-xs">身高體重</div>
                  <div className="font-medium">
                    {player.height ?? '-'} / {player.weight ? `${player.weight} lbs` : '-'}
                  </div>
                </div>
              )}
              {player.batSide && (
                <div>
                  <div className="text-blue-200 text-xs">打擊 / 投球</div>
                  <div className="font-medium">
                    {player.batSide.description}打 {player.pitchHand ? `/ ${player.pitchHand.description}投` : ''}
                  </div>
                </div>
              )}
              {player.mlbDebutDate && (
                <div>
                  <div className="text-blue-200 text-xs">大聯盟初登板</div>
                  <div className="font-medium">{player.mlbDebutDate}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 本季成績 */}
      {statsLoading ? (
        <div className="text-center py-8 text-gray-400">載入成績中...</div>
      ) : (
        <>
          {isBatter && <StatsTable stats={hitting} labels={HITTING_LABELS} title={`本季打擊成績 (${new Date().getFullYear()})`} />}
          {isPitcher && <StatsTable stats={pitching} labels={PITCHING_LABELS} title={`本季投球成績 (${new Date().getFullYear()})`} />}
          {!isBatter && !isPitcher && (
            <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500">
              本季尚無數據
            </div>
          )}
        </>
      )}

      {/* 資料來源標註 */}
      <div className="text-xs text-gray-400 text-center mt-6 pb-4">
        資料來源：MLB 官方 Stats API · 翻譯：AI 輔助
      </div>
    </div>
  );
}
