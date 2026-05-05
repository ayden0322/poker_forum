'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useState } from 'react';

/** 球員 statsSummary 名稱英文 → 中文 */
const SUMMARY_LABEL_ZH: Record<string, string> = {
  avgPoints: '場均得分',
  avgRebounds: '場均籃板',
  avgAssists: '場均助攻',
  avgSteals: '場均抄截',
  avgBlocks: '場均阻攻',
  fieldGoalPct: '投籃命中率',
  threePointFieldGoalPct: '三分命中率',
  freeThrowPct: '罰球命中率',
  pointsPerGame: '場均得分',
  reboundsPerGame: '場均籃板',
  assistsPerGame: '場均助攻',
  stealsPerGame: '場均抄截',
  blocksPerGame: '場均阻攻',
};

/** 籃球統計欄位簡寫 → 中文 */
const STAT_LABEL_ZH: Record<string, string> = {
  GP: '出賽',
  GS: '先發',
  MIN: '上場',
  FG: '投籃',
  'FG%': '投籃%',
  '3PT': '三分',
  '3P%': '三分%',
  FT: '罰球',
  'FT%': '罰球%',
  OR: '進攻籃板',
  DR: '防守籃板',
  REB: '籃板',
  AST: '助攻',
  BLK: '阻攻',
  STL: '抄截',
  PF: '犯規',
  TO: '失誤',
  PTS: '得分',
  DD2: '雙十',
  TD3: '大三元',
  DQ: '犯滿離場',
  EJECT: '驅逐',
  TECH: '技術犯規',
  FLAG: '惡意犯規',
  'AST/TO': '助失比',
  'STL/TO': '抄失比',
  'SC-EFF': '得分效率',
  'SH-EFF': '投籃效率',
};

/** "7th Season" → "第 7 年"，"Rookie" → "新秀年" */
function translateExperience(s?: string): string | undefined {
  if (!s) return s;
  if (/^Rookie$/i.test(s)) return '新秀年';
  const m = s.match(/^(\d+)(?:st|nd|rd|th)\s+Season$/i);
  if (m) return `第 ${m[1]} 年`;
  return s;
}

/** 傷兵狀態 → 中文 */
const INJURY_STATUS_ZH: Record<string, string> = {
  Out: '無法出賽',
  Doubtful: '極可能不出賽',
  Questionable: '出賽存疑',
  'Day-To-Day': '逐日觀察',
  Probable: '可能出賽',
  Available: '可出賽',
};

/** 傷勢類型 → 中文 */
const INJURY_DETAIL_ZH: Record<string, string> = {
  Sprain: '扭傷',
  Strain: '拉傷',
  Soreness: '痠痛',
  Surgery: '手術',
  Fracture: '骨折',
  Tear: '撕裂',
  Bruise: '挫傷',
  Concussion: '腦震盪',
  Illness: '生病',
  Rest: '休息',
  Tendonitis: '肌腱炎',
  Inflammation: '發炎',
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

interface AthleteData {
  athlete?: {
    id?: number;
    displayName?: string;
    fullName?: string;
    jersey?: string;
    headshot?: { href?: string };
    position?: { abbreviation?: string; displayName?: string };
    team?: { id?: number | string; displayName?: string; logo?: string; abbreviation?: string };
    displayHeight?: string;
    displayWeight?: string;
    age?: number;
    displayDOB?: string;
    displayBirthPlace?: string;
    displayExperience?: string;
    displayJersey?: string;
    college?: { name?: string };
    statsSummary?: { displayName?: string; statistics?: { name: string; displayValue: string }[] };
    injuries?: { type?: string; status?: string; date?: string; details?: { type?: string; detail?: string } }[];
  };
  nameZhTw?: string;
  nickname?: string;
}

interface StatsData {
  categories?: {
    name: string;
    displayName?: string;
    labels?: string[];
    statistics?: {
      season?: { displayName?: string; year?: number };
      teamSlug?: string;
      stats?: string[];
    }[];
  }[];
}

export default function NBAPlayerPageClient({ playerId }: { playerId: number }) {
  const [tab, setTab] = useState<'averages' | 'totals'>('averages');

  const { data: playerRes, isLoading } = useQuery({
    queryKey: ['nba-player', playerId],
    queryFn: () => apiFetch<{ data: AthleteData | null }>(`/nba/players/${playerId}`),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { data: statsRes } = useQuery({
    queryKey: ['nba-player-stats', playerId],
    queryFn: () => apiFetch<{ data: StatsData | null }>(`/nba/players/${playerId}/stats`),
    staleTime: 60 * 60 * 1000,
  });

  /** 30 隊翻譯 */
  const { data: teamsRes } = useQuery({
    queryKey: ['nba-teams-zh'],
    queryFn: () => apiFetch<{ data: { espnId: number | string; nameZhTw: string; shortName?: string }[] }>('/nba/teams'),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const teamZhById = new Map<number, string>();
  for (const t of teamsRes?.data ?? []) teamZhById.set(Number(t.espnId), t.shortName ?? t.nameZhTw);

  if (isLoading) {
    return <div className="p-6 text-center text-gray-500 animate-pulse">載入球員資料中...</div>;
  }

  const player = playerRes?.data;
  const ath = player?.athlete;
  if (!player || !ath) {
    return (
      <div className="p-6 text-center text-gray-500">
        找不到此球員資料。
        <Link href="/board/nba" className="ml-2 text-orange-500 hover:underline">回 NBA 板</Link>
      </div>
    );
  }

  const name = player.nameZhTw ?? ath.displayName ?? ath.fullName ?? 'NBA 球員';
  const headshot = ath.headshot?.href;
  const team = ath.team;
  const teamZh = team?.id ? teamZhById.get(Number(team.id)) : undefined;
  const summaryStats = ath.statsSummary?.statistics ?? [];
  const injuries = ath.injuries ?? [];

  const stats = statsRes?.data;
  const averages = stats?.categories?.find((c) => c.name === 'averages');
  const totals = stats?.categories?.find((c) => c.name === 'totals');
  const showCat = tab === 'averages' ? averages : totals;
  const seasons = (showCat?.statistics ?? []).slice(0, 8); // 最近 8 個賽季

  return (
    <div className="max-w-5xl mx-auto px-4 py-4">
      {/* 麵包屑 */}
      <nav className="text-sm text-gray-500 mb-3">
        <Link href="/board/nba" className="hover:text-orange-600">NBA 板</Link>
        <span className="mx-1">/</span>
        {team?.id && (
          <>
            <Link href={`/team/nba/${team.id}`} className="hover:text-orange-600">
              {teamZh ?? team.displayName}
            </Link>
            <span className="mx-1">/</span>
          </>
        )}
        <span>{name}</span>
      </nav>

      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 p-5 mb-4">
        <div className="flex items-center gap-5">
          {headshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={headshot}
              alt={name}
              className="w-24 h-24 rounded-full object-cover bg-white border-2 border-orange-200"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-2xl text-gray-400">
              ?
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              {team?.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={team.logo} alt="" className="w-4 h-4" />
              )}
              <span>{teamZh ?? team?.displayName ?? '—'}</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{name}</h1>
            {player.nickname && (
              <div className="text-xs text-orange-600 mb-2">「{player.nickname}」</div>
            )}
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
              {ath.jersey && (
                <span className="px-2 py-0.5 bg-white rounded font-mono text-xs border border-gray-200">
                  #{ath.jersey}
                </span>
              )}
              {ath.position?.abbreviation && (
                <span className="px-2 py-0.5 bg-orange-500 text-white rounded text-xs">
                  {ath.position.abbreviation}
                </span>
              )}
              {ath.displayHeight && <span>身高 {ath.displayHeight}</span>}
              {ath.displayWeight && <span>體重 {ath.displayWeight}</span>}
              {ath.age !== undefined && <span>{ath.age} 歲</span>}
              {ath.displayExperience && <span>{translateExperience(ath.displayExperience)}</span>}
            </div>
            {ath.displayBirthPlace && (
              <div className="mt-2 text-xs text-gray-500">出生地：{ath.displayBirthPlace}</div>
            )}
          </div>
        </div>

        {/* 本季摘要數據 */}
        {summaryStats.length > 0 && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-orange-200">
            {summaryStats.slice(0, 4).map((s, i) => (
              <div key={i} className="text-center bg-white rounded-lg p-2 border border-gray-100">
                <div className="text-[10px] text-gray-500">{SUMMARY_LABEL_ZH[s.name] ?? s.name}</div>
                <div className="text-lg font-bold text-orange-600 font-mono">{s.displayValue}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 傷兵狀態 */}
      {injuries.length > 0 && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 mb-4">
          <div className="text-xs font-semibold text-red-700 mb-1">⚠ 傷兵狀態</div>
          {injuries.slice(0, 2).map((inj, i) => {
            const status = inj.status ? (INJURY_STATUS_ZH[inj.status] ?? inj.status) : '';
            const detailRaw = inj.details?.detail ?? inj.details?.type ?? inj.type ?? '—';
            const detail = INJURY_DETAIL_ZH[detailRaw] ?? detailRaw;
            return (
              <div key={i} className="text-xs text-red-600">
                {status} · {detail}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 切換 */}
      <div className="flex gap-1 mb-3 border-b border-gray-200">
        <button
          onClick={() => setTab('averages')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === 'averages'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          場均數據
        </button>
        <button
          onClick={() => setTab('totals')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === 'totals'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          累計數據
        </button>
      </div>

      {/* 數據表 */}
      <div className="rounded-xl bg-white border border-gray-200 overflow-x-auto">
        {!showCat ? (
          <div className="p-6 text-center text-gray-400 text-sm">尚無生涯數據</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 py-2 text-left">賽季</th>
                <th className="px-2 py-2 text-left">球隊</th>
                {(showCat.labels ?? []).map((l, i) => (
                  <th key={i} className="px-2 py-2 text-center text-gray-600" title={l}>
                    {STAT_LABEL_ZH[l] ?? l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {seasons.map((s, i) => (
                <tr key={i} className={i === 0 ? 'bg-orange-50/30 font-medium' : ''}>
                  <td className="px-2 py-2 text-gray-700">
                    {s.season?.displayName ?? '—'}
                  </td>
                  <td className="px-2 py-2 text-gray-500 truncate max-w-[100px]">
                    {s.teamSlug ?? '—'}
                  </td>
                  {(s.stats ?? []).map((v, j) => (
                    <td key={j} className="px-2 py-2 text-center font-mono text-gray-700">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
