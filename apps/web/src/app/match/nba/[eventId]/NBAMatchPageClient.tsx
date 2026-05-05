'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useState, useMemo } from 'react';

/** 比賽狀態英文 → 中文 */
const STATUS_ZH: Record<string, string> = {
  'In Progress': '進行中',
  'Final': '已結束',
  'Final/OT': '已結束（延長）',
  'Scheduled': '未開始',
  'Halftime': '中場休息',
  'End of Period': '節間',
  'Postponed': '延期',
  'Canceled': '取消',
  'Suspended': '中止',
  'Delayed': '延遲',
};

/** 季後賽系列賽文字英譯：例 "MIN wins series 2-1" → "明尼蘇達 2-1 領先" */
function translateSeriesSummary(text: string, zhByAbbr: Map<string, string>): string {
  if (!text) return text;
  // 形如 "MIN wins series 2-1" 或 "Series tied 2-2" 或 "MIN leads series 2-1"
  const tied = text.match(/^Series\s+tied\s+(\d+-\d+)$/i);
  if (tied) return `系列賽戰平 ${tied[1]}`;
  const won = text.match(/^([A-Z]{2,4})\s+wins\s+series\s+(\d+-\d+)$/i);
  if (won) return `${zhByAbbr.get(won[1].toUpperCase()) ?? won[1]}贏得系列賽 ${won[2]}`;
  const leads = text.match(/^([A-Z]{2,4})\s+leads\s+series\s+(\d+-\d+)$/i);
  if (leads) return `${zhByAbbr.get(leads[1].toUpperCase()) ?? leads[1]}系列賽 ${leads[2]} 領先`;
  return text;
}

interface SummaryData {
  header?: {
    competitions?: {
      status?: { type?: { description?: string; completed?: boolean; state?: string }; period?: number; clock?: string };
      competitors?: {
        homeAway: 'home' | 'away';
        score?: string;
        winner?: boolean;
        team?: { id?: string; abbreviation?: string; displayName?: string; logo?: string; color?: string };
        linescores?: { value?: number; displayValue?: string }[];
      }[];
    }[];
  };
  boxscore?: {
    teams?: {
      homeAway: 'home' | 'away';
      team?: { id?: string; abbreviation?: string; displayName?: string };
      statistics?: { name?: string; label?: string; displayValue?: string }[];
    }[];
    players?: {
      team?: { id?: string; abbreviation?: string };
      statistics?: {
        labels?: string[];
        athletes?: {
          athlete?: { id?: string; displayName?: string; jersey?: string; position?: { abbreviation?: string }; headshot?: { href?: string } };
          stats?: string[];
          starter?: boolean;
          didNotPlay?: boolean;
        }[];
      }[];
    }[];
  };
  plays?: {
    id?: string;
    text?: string;
    scoreValue?: number;
    period?: { number?: number };
    clock?: { displayValue?: string };
    homeScore?: number;
    awayScore?: number;
    team?: { id?: string };
  }[];
  seasonseries?: { summary?: string }[];
  leaders?: any[];
}

export default function NBAMatchPageClient({ eventId }: { eventId: string }) {
  const [tab, setTab] = useState<'box' | 'plays' | 'team'>('box');

  // 若是 apisports-{id} 格式，先 resolve 成 ESPN eventId
  const isApiSports = eventId.startsWith('apisports-');
  const apiSportsId = isApiSports ? Number(eventId.replace('apisports-', '')) : null;

  const { data: resolved, isLoading: resolving } = useQuery({
    queryKey: ['nba-resolve', apiSportsId],
    queryFn: () =>
      apiFetch<{ data: { espnEventId: string | null } }>(`/nba/games/resolve/${apiSportsId}`),
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!apiSportsId,
  });

  const espnEventId = isApiSports ? resolved?.data?.espnEventId ?? null : eventId;

  const { data, isLoading } = useQuery({
    queryKey: ['nba-game-summary', espnEventId],
    queryFn: () => apiFetch<{ data: SummaryData | null }>(`/nba/games/${espnEventId}/summary`),
    staleTime: 60 * 1000,
    refetchInterval: 30 * 1000,
    enabled: !!espnEventId,
  });

  /** 30 隊中文翻譯 + ESPN id / abbreviation 對應 */
  const { data: teamsRes } = useQuery({
    queryKey: ['nba-teams-zh'],
    queryFn: () => apiFetch<{ data: { espnId: number | string; abbreviation: string; displayName: string; nameZhTw: string; shortName?: string }[] }>('/nba/teams'),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { zhByAbbr, zhById, shortById } = useMemo(() => {
    const byAbbr = new Map<string, string>();
    const byId = new Map<number, string>();
    const shortMap = new Map<number, string>();
    for (const t of teamsRes?.data ?? []) {
      const display = t.shortName ?? t.nameZhTw;
      const idNum = Number(t.espnId);
      byAbbr.set(t.abbreviation, display);
      byId.set(idNum, display);
      if (t.shortName) shortMap.set(idNum, t.shortName);
    }
    return { zhByAbbr: byAbbr, zhById: byId, shortById: shortMap };
  }, [teamsRes]);

  if (resolving || isLoading) {
    return <div className="p-6 text-center text-gray-500 animate-pulse">載入比賽資料中...</div>;
  }

  if (isApiSports && !espnEventId) {
    return (
      <div className="p-6 text-center text-gray-500">
        無法找到對應的 ESPN 比賽資料。
        <Link href="/board/nba" className="ml-2 text-orange-500 hover:underline">回 NBA 板</Link>
      </div>
    );
  }

  const summary = data?.data;
  const comp = summary?.header?.competitions?.[0];
  if (!summary || !comp) {
    return (
      <div className="p-6 text-center text-gray-500">
        找不到比賽資料。
        <Link href="/board/nba" className="ml-2 text-orange-500 hover:underline">回 NBA 板</Link>
      </div>
    );
  }

  const home = comp.competitors?.find((c) => c.homeAway === 'home');
  const away = comp.competitors?.find((c) => c.homeAway === 'away');
  const status = comp.status?.type;
  const completed = status?.completed ?? false;
  const inProgress = status?.state === 'in';
  const seasonSeriesRaw = summary.seasonseries?.[0]?.summary;
  const seasonSeries = seasonSeriesRaw ? translateSeriesSummary(seasonSeriesRaw, zhByAbbr) : undefined;
  const statusDescZh = status?.description ? (STATUS_ZH[status.description] ?? status.description) : '—';
  const homeAbbr = home?.team?.abbreviation;
  const awayAbbr = away?.team?.abbreviation;
  // 優先用 ID 對應，fallback 到 abbreviation 對應
  const homeZh = (home?.team?.id ? zhById.get(Number(home.team.id)) : undefined) ?? (homeAbbr ? zhByAbbr.get(homeAbbr) : undefined);
  const awayZh = (away?.team?.id ? zhById.get(Number(away.team.id)) : undefined) ?? (awayAbbr ? zhByAbbr.get(awayAbbr) : undefined);

  return (
    <div className="max-w-5xl mx-auto px-4 py-4">
      <nav className="text-sm text-gray-500 mb-3">
        <Link href="/board/nba" className="hover:text-orange-600">NBA 板</Link>
        <span className="mx-1">/</span>
        <span>{awayZh ?? awayAbbr} @ {homeZh ?? homeAbbr}</span>
      </nav>

      {/* 比分 Header */}
      <div className="rounded-xl bg-gradient-to-br from-gray-50 to-orange-50 border border-orange-100 p-5 mb-4">
        <div className="flex items-center justify-between gap-4">
          {/* Away */}
          <TeamScoreBlock comp={away} align="left" winner={completed && away?.winner} nameZh={awayZh} />
          {/* Status */}
          <div className="text-center px-3 flex-shrink-0">
            <div
              className={`text-xs font-semibold mb-1 ${
                inProgress ? 'text-red-600 animate-pulse' : completed ? 'text-gray-500' : 'text-orange-600'
              }`}
            >
              {inProgress && '🔴 '}
              {statusDescZh}
            </div>
            {inProgress && comp.status?.period !== undefined && (
              <div className="text-xs text-gray-500">
                第 {comp.status.period} 節 {comp.status.clock ?? ''}
              </div>
            )}
            {seasonSeries && (
              <div className="text-[10px] text-gray-400 mt-1">{seasonSeries}</div>
            )}
          </div>
          {/* Home */}
          <TeamScoreBlock comp={home} align="right" winner={completed && home?.winner} nameZh={homeZh} />
        </div>

        {/* Linescore (按節得分) */}
        {(home?.linescores?.length ?? 0) > 0 && (
          <div className="mt-4 pt-3 border-t border-orange-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left text-gray-500 font-normal w-12"></th>
                  {(home?.linescores ?? []).map((_, i) => (
                    <th key={i} className="text-center text-gray-500 font-medium">
                      Q{i + 1}
                    </th>
                  ))}
                  <th className="text-center text-gray-500 font-medium">總分</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="text-gray-500 font-mono py-0.5">{away?.team?.abbreviation}</td>
                  {(away?.linescores ?? []).map((q, i) => (
                    <td key={i} className="text-center font-mono text-gray-700">
                      {q.displayValue ?? q.value ?? '—'}
                    </td>
                  ))}
                  <td className="text-center font-mono font-bold text-gray-900">{away?.score}</td>
                </tr>
                <tr>
                  <td className="text-gray-500 font-mono py-0.5">{home?.team?.abbreviation}</td>
                  {(home?.linescores ?? []).map((q, i) => (
                    <td key={i} className="text-center font-mono text-gray-700">
                      {q.displayValue ?? q.value ?? '—'}
                    </td>
                  ))}
                  <td className="text-center font-mono font-bold text-gray-900">{home?.score}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tab 切換 */}
      <div className="flex gap-1 mb-3 border-b border-gray-200">
        <TabButton active={tab === 'box'} onClick={() => setTab('box')}>
          球員數據
        </TabButton>
        <TabButton active={tab === 'team'} onClick={() => setTab('team')}>
          團隊統計
        </TabButton>
        <TabButton active={tab === 'plays'} onClick={() => setTab('plays')}>
          逐回合
        </TabButton>
      </div>

      {tab === 'box' && <BoxScoreView boxscore={summary.boxscore} zhById={zhById} />}
      {tab === 'team' && <TeamStatsView boxscore={summary.boxscore} zhById={zhById} />}
      {tab === 'plays' && <PlaysView plays={summary.plays ?? []} home={home} away={away} />}
    </div>
  );
}

function TeamScoreBlock({
  comp,
  align,
  winner,
  nameZh,
}: {
  comp?: any;
  align: 'left' | 'right';
  winner?: boolean | null;
  nameZh?: string;
}) {
  const team = comp?.team;
  const justify = align === 'left' ? 'justify-start' : 'justify-end';
  return (
    <div className={`flex-1 flex ${justify}`}>
      <Link
        href={team?.id ? `/team/nba/${team.id}` : '#'}
        className={`flex items-center gap-3 ${align === 'right' ? 'flex-row-reverse' : ''} hover:opacity-80 transition`}
      >
        {team?.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logo} alt="" className="w-14 h-14 flex-shrink-0" />
        )}
        <div className={align === 'right' ? 'text-right' : 'text-left'}>
          <div className="text-xs text-gray-500">{team?.abbreviation ?? '—'}</div>
          <div
            className={`font-semibold text-gray-800 ${winner ? 'underline decoration-orange-500 decoration-2 underline-offset-2' : ''}`}
          >
            {nameZh ?? team?.displayName ?? '—'}
          </div>
          <div
            className={`text-3xl font-bold font-mono ${winner ? 'text-orange-600' : 'text-gray-700'}`}
          >
            {comp?.score ?? '—'}
          </div>
        </div>
      </Link>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
        active ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

function BoxScoreView({ boxscore, zhById }: { boxscore: SummaryData['boxscore']; zhById: Map<number, string> }) {
  const groups = boxscore?.players ?? [];
  if (groups.length === 0) {
    return <div className="rounded-xl bg-white border border-gray-200 p-6 text-center text-gray-400 text-sm">尚無球員數據</div>;
  }
  return (
    <div className="space-y-3">
      {groups.map((g, gi) => {
        const sg = g.statistics?.[0];
        const teamZh = g.team?.id ? zhById.get(Number(g.team.id)) : undefined;
        return (
          <div key={gi} className="rounded-xl bg-white border border-gray-200 overflow-x-auto">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 font-semibold text-sm text-gray-700">
              {teamZh ?? g.team?.abbreviation}
              {teamZh && <span className="ml-2 text-xs text-gray-400 font-normal">{g.team?.abbreviation}</span>}
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-2 py-1.5 text-left">球員</th>
                  {(sg?.labels ?? []).map((l, i) => (
                    <th key={i} className="px-2 py-1.5 text-center font-mono text-gray-600">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(sg?.athletes ?? []).map((a, ai) => {
                  const ath = a.athlete;
                  return (
                    <tr key={ai} className={a.starter ? 'font-medium' : ''}>
                      <td className="px-2 py-1.5 truncate max-w-[140px]">
                        <Link
                          href={ath?.id ? `/player/nba/${ath.id}` : '#'}
                          className="hover:text-orange-600"
                        >
                          {ath?.displayName ?? '—'}
                          {a.starter && <span className="ml-1 text-[9px] text-orange-500">先發</span>}
                          {a.didNotPlay && <span className="ml-1 text-[9px] text-gray-400">未上場</span>}
                        </Link>
                      </td>
                      {(a.stats ?? []).map((v, j) => (
                        <td key={j} className="px-2 py-1.5 text-center font-mono text-gray-700">
                          {v}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/** 團隊統計欄位英文 → 中文 */
const TEAM_STAT_ZH: Record<string, string> = {
  'FG': '投籃',
  'Field Goal %': '投籃命中率',
  'Field Goals': '投籃',
  '3PT': '三分球',
  'Three Point %': '三分球命中率',
  '3-Point Field Goals': '三分球',
  'FT': '罰球',
  'Free Throw %': '罰球命中率',
  'Free Throws': '罰球',
  'Rebounds': '籃板',
  'Offensive Rebounds': '進攻籃板',
  'Defensive Rebounds': '防守籃板',
  'Assists': '助攻',
  'Steals': '抄截',
  'Blocks': '阻攻',
  'Turnovers': '失誤',
  'Total Turnovers': '總失誤',
  'Fouls': '犯規',
  'Personal Fouls': '個人犯規',
  'Technical Fouls': '技術犯規',
  'Flagrant Fouls': '惡意犯規',
  'Largest Lead': '最大領先',
  'Fast Break Points': '快攻得分',
  'Points in Paint': '禁區得分',
  'Points off Turnovers': '失誤得分',
  'Second Chance Points': '二次進攻',
  'Bench Points': '替補得分',
};

function TeamStatsView({ boxscore, zhById }: { boxscore: SummaryData['boxscore']; zhById: Map<number, string> }) {
  const teams = boxscore?.teams ?? [];
  if (teams.length < 2) {
    return <div className="rounded-xl bg-white border border-gray-200 p-6 text-center text-gray-400 text-sm">尚無團隊統計</div>;
  }
  const away = teams.find((t) => t.homeAway === 'away');
  const home = teams.find((t) => t.homeAway === 'home');
  if (!away || !home) return null;

  const labels = (away.statistics ?? []).map((s) => s.label ?? s.name);
  const awayMap = Object.fromEntries((away.statistics ?? []).map((s) => [s.label ?? s.name, s.displayValue]));
  const homeMap = Object.fromEntries((home.statistics ?? []).map((s) => [s.label ?? s.name, s.displayValue]));
  const awayZh = away.team?.id ? zhById.get(Number(away.team.id)) : undefined;
  const homeZh = home.team?.id ? zhById.get(Number(home.team.id)) : undefined;

  return (
    <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-sm font-semibold">
        <div className="text-left">{awayZh ?? away.team?.abbreviation}</div>
        <div className="text-center text-gray-500">統計項目</div>
        <div className="text-right">{homeZh ?? home.team?.abbreviation}</div>
      </div>
      <div className="divide-y divide-gray-100">
        {labels.map((l) => (
          <div key={l} className="grid grid-cols-3 px-4 py-2 text-sm">
            <div className="text-left font-mono text-gray-700">{awayMap[l!]}</div>
            <div className="text-center text-xs text-gray-500">{TEAM_STAT_ZH[l!] ?? l}</div>
            <div className="text-right font-mono text-gray-700">{homeMap[l!]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlaysView({
  plays,
  home,
  away,
}: {
  plays: NonNullable<SummaryData['plays']>;
  home?: any;
  away?: any;
}) {
  const [filter, setFilter] = useState<'recent' | 'scoring' | 'all'>('recent');
  let visible = plays;
  if (filter === 'scoring') visible = plays.filter((p) => (p.scoreValue ?? 0) > 0);
  if (filter === 'recent') visible = plays.slice(-30).reverse();
  else visible = [...visible].reverse();

  return (
    <div>
      <div className="flex gap-1 mb-2">
        <FilterButton active={filter === 'recent'} onClick={() => setFilter('recent')}>近期</FilterButton>
        <FilterButton active={filter === 'scoring'} onClick={() => setFilter('scoring')}>得分</FilterButton>
        <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>全部</FilterButton>
        <span className="ml-auto text-xs text-gray-400 self-center">{visible.length} 則</span>
      </div>
      <div className="rounded-xl bg-white border border-gray-200 max-h-[500px] overflow-y-auto">
        <div className="divide-y divide-gray-100">
          {visible.map((p, i) => {
            const isHome = p.team?.id && home?.team?.id && p.team.id === home.team.id;
            const isAway = p.team?.id && away?.team?.id && p.team.id === away.team.id;
            const tag = isHome ? home.team.abbreviation : isAway ? away.team.abbreviation : '';
            return (
              <div
                key={p.id ?? i}
                className={`flex items-start gap-2 px-3 py-2 text-xs ${
                  (p.scoreValue ?? 0) > 0 ? 'bg-orange-50/40' : ''
                }`}
              >
                <div className="text-[10px] text-gray-400 font-mono flex-shrink-0 w-16 pt-0.5">
                  Q{p.period?.number} {p.clock?.displayValue}
                </div>
                {tag && (
                  <span className="text-[9px] bg-gray-100 text-gray-500 px-1 rounded font-mono flex-shrink-0">
                    {tag}
                  </span>
                )}
                <div className="flex-1 text-gray-700">{p.text}</div>
                <div className="text-[10px] text-gray-400 font-mono flex-shrink-0">
                  {p.awayScore}-{p.homeScore}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded text-xs font-medium transition ${
        active ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-orange-100'
      }`}
    >
      {children}
    </button>
  );
}
