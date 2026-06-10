'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface BoxPlayer {
  teamId: number;
  name: string;
  starter: boolean;
  minutes: string | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  fgm: number | null;
  fga: number | null;
  tpm: number | null;
  tpa: number | null;
  ftm: number | null;
  fta: number | null;
}
interface BoxScore {
  teams: { teamId: number; rebounds: number | null; assists: number | null; steals: number | null; blocks: number | null; turnovers: number | null }[];
  players: BoxPlayer[];
}
interface OddsData {
  bookmaker: string | null;
  markets: { name: string; values: { label: string; odd: string }[] }[];
}

const MARKET_ZH: Record<string, string> = {
  'Home/Away': '勝負',
  '3Way Result': '三式（含平手）',
  'Asian Handicap': '亞洲讓分',
  'Handicap Result': '讓分',
  'Over/Under': '大小分',
  'Double Chance': '雙重機會',
};

export interface BBScore {
  quarter_1: number | null;
  quarter_2: number | null;
  quarter_3: number | null;
  quarter_4: number | null;
  over_time: number | null;
  total: number | null;
}
export interface BBTeam {
  id: number;
  name: string;
  nameZhTw?: string | null;
  shortName?: string | null;
  logo: string;
  score: number | null;
}
export interface BBGame {
  id: number;
  league: string;
  date: string;
  timestamp: number;
  status: string;
  statusShort: string;
  stage: string | null;
  venue: string | null;
  teams: { home: BBTeam; away: BBTeam };
  scores?: { home: BBScore; away: BBScore };
}

function label(t: BBTeam): string {
  return t.nameZhTw ?? t.name;
}

function twDateTime(ts: number): string {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function statusBadge(short: string) {
  if (short === 'LIVE') return { text: '● 進行中', cls: 'bg-red-500 text-white animate-pulse' };
  if (short === 'FT') return { text: '比賽結束', cls: 'bg-gray-200 text-gray-700' };
  return { text: '尚未開始', cls: 'bg-blue-50 text-blue-600' };
}

function TeamBlock({ league, t }: { league: string; t: BBTeam }) {
  return (
    <Link
      href={`/team/basketball/${league}/${t.id}`}
      className="flex flex-col items-center gap-2 flex-1 hover:opacity-80 transition-opacity"
    >
      {t.logo && (
        <img
          src={t.logo}
          alt={label(t)}
          className="w-16 h-16 md:w-20 md:h-20 object-contain"
          onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
        />
      )}
      <span className="font-bold text-gray-800 text-center text-sm md:text-base">{label(t)}</span>
    </Link>
  );
}

function pct(m: number | null, a: number | null): string {
  if (!a) return '-';
  return `${m ?? 0}/${a}`;
}

function BoxScoreSection({ box, home, away }: { box?: { data: BoxScore }; home: BBTeam; away: BBTeam }) {
  const players = box?.data?.players ?? [];
  if (players.length === 0) return null;
  const cols = ['分', '籃板', '助攻', '投籃', '三分', '罰球', '時間'];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
      <div className="px-4 py-2 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-white text-sm font-bold text-gray-700">
        📊 Box Score 球員數據
      </div>
      {[away, home].map((t) => {
        const rows = players
          .filter((p) => p.teamId === t.id)
          .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
        if (rows.length === 0) return null;
        return (
          <div key={t.id}>
            <div className="px-4 py-1.5 bg-gray-50/80 border-b border-gray-100 text-xs font-medium text-gray-600 flex items-center gap-2">
              {t.logo && <img src={t.logo} alt="" className="w-4 h-4 object-contain" />}
              {t.nameZhTw ?? t.name}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-100">
                    <th className="text-left px-3 py-1.5 font-medium">球員</th>
                    {cols.map((c) => (
                      <th key={c} className="text-center px-2 py-1.5 font-medium whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <span className="text-gray-800">{p.name}</span>
                        {p.starter && <span className="ml-1 text-[9px] text-orange-500">先發</span>}
                      </td>
                      <td className="text-center px-2 py-1.5 tabular-nums font-bold text-gray-900">{p.points ?? '-'}</td>
                      <td className="text-center px-2 py-1.5 tabular-nums text-gray-600">{p.rebounds ?? '-'}</td>
                      <td className="text-center px-2 py-1.5 tabular-nums text-gray-600">{p.assists ?? '-'}</td>
                      <td className="text-center px-2 py-1.5 tabular-nums text-gray-500">{pct(p.fgm, p.fga)}</td>
                      <td className="text-center px-2 py-1.5 tabular-nums text-gray-500">{pct(p.tpm, p.tpa)}</td>
                      <td className="text-center px-2 py-1.5 tabular-nums text-gray-500">{pct(p.ftm, p.fta)}</td>
                      <td className="text-center px-2 py-1.5 tabular-nums text-gray-400">{p.minutes ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OddsPanel({ odds }: { odds?: { data: OddsData | null } }) {
  const data = odds?.data;
  if (!data?.markets?.length) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
      <div className="px-4 py-2 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-white text-sm font-bold text-gray-700 flex items-center">
        🎯 賠率
        {data.bookmaker && <span className="ml-auto text-[10px] text-gray-400 font-normal">{data.bookmaker}</span>}
      </div>
      <div className="p-3 space-y-3">
        {data.markets.map((m) => (
          <div key={m.name}>
            <div className="text-xs font-medium text-gray-500 mb-1">{MARKET_ZH[m.name] ?? m.name}</div>
            <div className="flex flex-wrap gap-1.5">
              {m.values.map((v, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-50 border border-gray-100">
                  <span className="text-gray-500">{v.label}</span>
                  <span className="font-bold text-orange-600 tabular-nums">{v.odd}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 pb-2 text-[10px] text-gray-300">賠率僅供參考，實際以下注平台為準</div>
    </div>
  );
}

export default function BasketballMatchClient({
  league,
  leagueName,
  game,
  canBoxScore,
  canOdds,
}: {
  league: string;
  leagueName: string;
  game: BBGame;
  canBoxScore: boolean;
  canOdds: boolean;
}) {
  const badge = statusBadge(game.statusShort);
  const home = game.teams.home;
  const away = game.teams.away;
  const started = game.statusShort === 'FT' || game.statusShort === 'LIVE';

  const { data: box } = useQuery({
    queryKey: ['bb-boxscore', league, game.id],
    queryFn: () => apiFetch<{ data: BoxScore }>(`/basketball/${league}/games/${game.id}/boxscore`),
    enabled: canBoxScore && started,
    staleTime: 60 * 1000,
  });
  const { data: odds } = useQuery({
    queryKey: ['bb-odds', league, game.id],
    queryFn: () => apiFetch<{ data: OddsData | null }>(`/basketball/${league}/odds?gameId=${game.id}`),
    enabled: canOdds,
    staleTime: 5 * 60 * 1000,
  });
  const sc = game.scores;
  const hasScore = home.score != null && away.score != null;
  const quarters: { key: keyof BBScore; label: string }[] = [
    { key: 'quarter_1', label: 'Q1' },
    { key: 'quarter_2', label: 'Q2' },
    { key: 'quarter_3', label: 'Q3' },
    { key: 'quarter_4', label: 'Q4' },
  ];
  const showOt = (sc?.home.over_time ?? null) != null || (sc?.away.over_time ?? null) != null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      {/* 麵包屑 */}
      <nav className="text-xs text-gray-400 mb-3 flex items-center gap-1">
        <Link href="/" className="hover:text-gray-600">首頁</Link>
        <span>›</span>
        <Link href={`/board/${league}`} className="hover:text-gray-600">{leagueName}</Link>
        <span>›</span>
        <span className="text-gray-500">比賽詳情</span>
      </nav>

      {/* 比分卡 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <div className="px-4 py-2 bg-gradient-to-r from-orange-50 to-white flex items-center gap-2 border-b border-gray-100">
          <span>🏀</span>
          <span className="text-sm font-bold text-gray-700">{leagueName}</span>
          {game.stage && <span className="text-xs text-gray-400">· {game.stage}</span>}
          <span className={`ml-auto text-[11px] px-2 py-0.5 rounded font-medium ${badge.cls}`}>{badge.text}</span>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <TeamBlock league={league} t={away} />
            <div className="flex flex-col items-center">
              {hasScore ? (
                <div className="text-3xl md:text-4xl font-extrabold tabular-nums text-gray-900">
                  {away.score} <span className="text-gray-300">:</span> {home.score}
                </div>
              ) : (
                <div className="text-lg font-bold text-gray-400">VS</div>
              )}
              <div className="text-[11px] text-gray-400 mt-1">{twDateTime(game.timestamp)}</div>
            </div>
            <TeamBlock league={league} t={home} />
          </div>

          {game.venue && (
            <div className="text-center text-xs text-gray-400 mt-3">📍 {game.venue}</div>
          )}
        </div>

        {/* 逐節比分 */}
        {sc && hasScore && (
          <div className="border-t border-gray-100 px-4 py-3 overflow-x-auto">
            <table className="w-full text-sm text-center">
              <thead>
                <tr className="text-gray-400 text-xs">
                  <th className="text-left font-medium py-1">球隊</th>
                  {quarters.map((q) => (
                    <th key={q.key} className="font-medium py-1 px-2">{q.label}</th>
                  ))}
                  {showOt && <th className="font-medium py-1 px-2">OT</th>}
                  <th className="font-bold py-1 px-2 text-gray-600">總分</th>
                </tr>
              </thead>
              <tbody>
                {([away, home] as BBTeam[]).map((t, idx) => {
                  const row = idx === 0 ? sc.away : sc.home;
                  return (
                    <tr key={t.id} className="border-t border-gray-50">
                      <td className="text-left py-1.5 font-medium text-gray-700">{t.shortName ?? label(t)}</td>
                      {quarters.map((q) => (
                        <td key={q.key} className="py-1.5 px-2 tabular-nums text-gray-600">{row[q.key] ?? '-'}</td>
                      ))}
                      {showOt && <td className="py-1.5 px-2 tabular-nums text-gray-600">{row.over_time ?? '-'}</td>}
                      <td className="py-1.5 px-2 tabular-nums font-bold text-gray-900">{row.total ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 賠率（有 odds 能力的聯賽）*/}
      {canOdds && <OddsPanel odds={odds} />}

      {/* Box Score 球員數據（有 boxScore 能力的聯賽）*/}
      {canBoxScore && <BoxScoreSection box={box} home={home} away={away} />}

      {/* inline CTA：接在「看完比分的動作」後 */}
      <div className="flex gap-3">
        <Link
          href={`/board/${league}`}
          className="flex-1 text-center py-2.5 rounded-lg bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 transition-colors"
        >
          💬 聊這場 · 進 {leagueName} 討論區
        </Link>
        {canOdds && (
          <Link
            href={`/board/${league}`}
            className="flex-1 text-center py-2.5 rounded-lg border border-orange-400 text-orange-600 font-medium text-sm hover:bg-orange-50 transition-colors"
          >
            🎯 競猜這場
          </Link>
        )}
      </div>

      <div className="mt-4 text-center">
        <Link href={`/board/${league}`} className="text-xs text-gray-400 hover:text-gray-600">← 返回 {leagueName}</Link>
      </div>
    </div>
  );
}
