'use client';

import { useQuery, useQueries } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { FeaturedPostCard } from '@/components/board/FeaturedPostCard';

/**
 * 首頁棒球主場 — 多聯盟即時賽事中心（雷速風格，以棒球為主）
 *
 * 核心：三狀態「條列式」賽事（進行中 / 尚未開賽 / 已結束），每列可點進該場賽事詳情。
 *  - 聯盟切換：MLB / 中職 / 日職 / 韓職 / 其他棒球(LMB)
 *  - 日期切換：昨日 / 今日 / 明日（台灣時區）
 *  - MLB 走官方 API（/mlb/schedule/tw），其餘走 /baseball/:league/games/tw，前端正規化成同一種 row
 *  - 下方保留該聯盟的最新新聞 / 熱門討論 + 數據面板
 */

/* ───────────── 聯盟設定（含跨聯盟模式用的 badge 配色） ───────────── */
const LEAGUES = [
  { slug: 'mlb', label: 'MLB', badge: 'MLB', badgeCls: 'bg-blue-50 text-blue-700' },
  { slug: 'cpbl', label: '中華職棒', badge: '中職', badgeCls: 'bg-red-50 text-red-600' },
  { slug: 'npb', label: '日本職棒', badge: '日職', badgeCls: 'bg-rose-50 text-rose-600' },
  { slug: 'kbo', label: '韓國職棒', badge: '韓職', badgeCls: 'bg-indigo-50 text-indigo-600' },
  { slug: 'other-baseball', label: '其他棒球', badge: '其他', badgeCls: 'bg-gray-100 text-gray-500' },
] as const;
type LeagueSlug = (typeof LEAGUES)[number]['slug'];

/** slug → badge 文字/配色（跨聯盟清單用） */
const LEAGUE_BADGE: Record<string, { badge: string; badgeCls: string }> = Object.fromEntries(
  LEAGUES.map((l) => [l.slug, { badge: l.badge, badgeCls: l.badgeCls }]),
);

/** 運動別主切換（Phase 2：三運動皆啟用） */
const SPORTS = [
  { key: 'baseball', label: '棒球', icon: '⚾', enabled: true },
  { key: 'basketball', label: '籃球', icon: '🏀', enabled: true },
  { key: 'football', label: '足球', icon: '⚽', enabled: true },
] as const;
type SportKey = (typeof SPORTS)[number]['key'];

/** 籃球聯盟（目前只接 NBA，走 /sports/nba/recent） */
const BASKETBALL_LEAGUES = [
  { slug: 'nba', label: 'NBA', badge: 'NBA', badgeCls: 'bg-orange-50 text-orange-600' },
] as const;

/**
 * 足球聯盟：友誼賽走專屬 /sports/friendlies/matches（有中文名+logo）；
 * 其餘聯賽走通用 /sports/:slug/recent（淡季空、開季自動亮）。
 */
const FOOTBALL_LEAGUES = [
  { slug: 'friendlies', label: '友誼賽', badge: '友誼', badgeCls: 'bg-teal-50 text-teal-600', source: 'friendlies' as const },
  { slug: 'world-cup', label: '世界盃', badge: '世界盃', badgeCls: 'bg-amber-50 text-amber-700', source: 'generic' as const },
  { slug: 'epl', label: '英超', badge: '英超', badgeCls: 'bg-purple-50 text-purple-700', source: 'generic' as const },
  { slug: 'la-liga', label: '西甲', badge: '西甲', badgeCls: 'bg-red-50 text-red-600', source: 'generic' as const },
  { slug: 'serie-a', label: '義甲', badge: '義甲', badgeCls: 'bg-blue-50 text-blue-700', source: 'generic' as const },
  { slug: 'bundesliga', label: '德甲', badge: '德甲', badgeCls: 'bg-rose-50 text-rose-600', source: 'generic' as const },
  { slug: 'ligue-1', label: '法甲', badge: '法甲', badgeCls: 'bg-indigo-50 text-indigo-600', source: 'generic' as const },
  { slug: 'ucl', label: '歐冠', badge: '歐冠', badgeCls: 'bg-slate-100 text-slate-700', source: 'generic' as const },
] as const;

const DATE_TABS = [
  { key: 'yesterday', label: '昨日', offset: -1 },
  { key: 'today', label: '今日', offset: 0 },
  { key: 'tomorrow', label: '明日', offset: 1 },
] as const;
type DateKey = (typeof DATE_TABS)[number]['key'];

/* ───────────── 共用時間工具（台灣時區） ───────────── */
function twDate(offsetDays = 0): string {
  const now = new Date();
  const tw = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  tw.setDate(tw.getDate() + offsetDays);
  const y = tw.getFullYear();
  const m = String(tw.getMonth() + 1).padStart(2, '0');
  const d = String(tw.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function twDateLabel(offset: number): string {
  const [, m, d] = twDate(offset).split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}
function twTime(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('zh-TW', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei',
    });
  } catch {
    return '';
  }
}

/* ───────────── 正規化後的統一賽事型別 ───────────── */
type GameState = 'Live' | 'Preview' | 'Final';
interface HubTeam {
  name: string;
  logo: string;
  score: number | null;
  winner: boolean;
}
interface HubGame {
  key: string;
  league: string; // 跨運動：棒球聯盟 / nba / friendlies / 足球聯賽 slug
  badge: string;
  badgeCls: string;
  state: GameState;
  href: string;
  detail: string; // Live→局數/節次/分鐘；Preview→開賽時間；Final→「終」
  away: HubTeam;
  home: HubTeam;
}

/* ───────────── MLB 來源（官方 API） ───────────── */
interface MlbGame {
  gamePk: number;
  gameDate: string;
  status: { abstractGameState: string };
  teams: {
    away: { team: { id: number; name: string }; score?: number; isWinner?: boolean };
    home: { team: { id: number; name: string }; score?: number; isWinner?: boolean };
  };
  linescore?: { currentInning?: number; inningState?: string };
}
interface MlbTeamTr { id: number; nameZhTw: string; shortName?: string }

function mlbInning(g: MlbGame): string {
  if (!g.linescore?.currentInning) return '進行中';
  const half = g.linescore.inningState;
  const h = half === 'Top' || half === 'Middle' ? '上' : half === 'Bottom' || half === 'End' ? '下' : '';
  return `${g.linescore.currentInning}局${h}`;
}
function normalizeMlb(games: MlbGame[], tr: Map<number, MlbTeamTr>): HubGame[] {
  const name = (id: number, fallback: string) => tr.get(id)?.shortName ?? tr.get(id)?.nameZhTw ?? fallback;
  const logo = (id: number) => `https://www.mlbstatic.com/team-logos/${id}.svg`;
  return games.map((g) => {
    const state = (g.status.abstractGameState as GameState) ?? 'Preview';
    const detail = state === 'Live' ? mlbInning(g) : state === 'Final' ? '終' : twTime(g.gameDate);
    return {
      key: `mlb-${g.gamePk}`,
      league: 'mlb' as LeagueSlug,
      badge: LEAGUE_BADGE.mlb.badge,
      badgeCls: LEAGUE_BADGE.mlb.badgeCls,
      state,
      href: `/match/mlb/${g.gamePk}`,
      detail,
      away: {
        name: name(g.teams.away.team.id, g.teams.away.team.name),
        logo: logo(g.teams.away.team.id),
        score: g.teams.away.score ?? null,
        winner: !!g.teams.away.isWinner,
      },
      home: {
        name: name(g.teams.home.team.id, g.teams.home.team.name),
        logo: logo(g.teams.home.team.id),
        score: g.teams.home.score ?? null,
        winner: !!g.teams.home.isWinner,
      },
    };
  });
}

/* ───────────── 通用棒球來源（API-Sports） ───────────── */
interface ApiTeam { id: number; name?: string; nameZhTw?: string; shortName?: string; logo?: string; score?: number | null }
interface ApiGame {
  id: number; date?: string; timestamp?: number; statusShort?: string;
  teams?: { home?: ApiTeam; away?: ApiTeam };
}
const LIVE_CODES = new Set(['IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'IN7', 'IN8', 'IN9', 'LIVE', 'BT', 'P1', 'P2']);
const FINAL_CODES = new Set(['FT', 'AOT', 'AET', 'CANC', 'POST']);
function genericState(short?: string): GameState {
  const s = (short ?? 'NS').toUpperCase();
  if (LIVE_CODES.has(s)) return 'Live';
  if (FINAL_CODES.has(s)) return 'Final';
  return 'Preview';
}
function genericInning(short?: string): string {
  const m = (short ?? '').toUpperCase().match(/^IN(\d)$/);
  return m ? `${m[1]}局` : '進行中';
}
function teamLabel(t?: ApiTeam): string {
  return t?.shortName || t?.nameZhTw || t?.name || '未知';
}
function normalizeGeneric(games: ApiGame[], league: string): HubGame[] {
  return games.map((g) => {
    const state = genericState(g.statusShort);
    const a = g.teams?.away;
    const h = g.teams?.home;
    const as = a?.score ?? null;
    const hs = h?.score ?? null;
    const time = g.timestamp ? twTime(new Date(g.timestamp * 1000).toISOString()) : twTime(g.date);
    const detail = state === 'Live' ? genericInning(g.statusShort) : state === 'Final' ? '終' : time;
    const meta = LEAGUE_BADGE[league] ?? { badge: league, badgeCls: 'bg-gray-100 text-gray-500' };
    return {
      key: `${league}-${g.id}`,
      league: league as LeagueSlug,
      badge: meta.badge,
      badgeCls: meta.badgeCls,
      state,
      href: `/match/baseball/${league}/${g.id}`,
      detail,
      away: {
        name: teamLabel(a),
        logo: a?.logo ?? '',
        score: as,
        winner: state === 'Final' && as != null && hs != null && as > hs,
      },
      home: {
        name: teamLabel(h),
        logo: h?.logo ?? '',
        score: hs,
        winner: state === 'Final' && as != null && hs != null && hs > as,
      },
    };
  });
}

/* ───────────── 籃球來源（NBA，/sports/nba/recent，ESPN→後端正規化） ───────────── */
interface NbaRecentGame {
  id: number;
  date?: string;
  timestamp?: number;
  status: { long?: string; short?: string; timer?: string | null };
  teams: { home: { id: number; name: string; logo?: string }; away: { id: number; name: string; logo?: string } };
  scores: { home: { total: number | null }; away: { total: number | null } };
}
const NBA_LIVE = new Set(['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'BT', 'HT', 'IN', 'LIVE']);
const NBA_FINAL = new Set(['FT', 'AOT', 'AET', 'POST', 'CANC']);
function nbaState(short?: string): GameState {
  const s = (short ?? 'NS').toUpperCase();
  if (NBA_FINAL.has(s)) return 'Final';
  if (NBA_LIVE.has(s)) return 'Live';
  return 'Preview';
}
function normalizeNba(games: NbaRecentGame[]): HubGame[] {
  const meta = BASKETBALL_LEAGUES[0]; // NBA
  return games.map((g) => {
    const state = nbaState(g.status.short);
    const time = g.timestamp ? twTime(new Date(g.timestamp * 1000).toISOString()) : twTime(g.date);
    const detail = state === 'Live' ? (g.status.timer || g.status.short || '進行中') : state === 'Final' ? '終' : time;
    const hs = g.scores.home.total;
    const as = g.scores.away.total;
    return {
      key: `nba-${g.id}`,
      league: 'nba',
      badge: meta.badge,
      badgeCls: meta.badgeCls,
      state,
      href: `/match/baseball/nba/${g.id}`,
      detail,
      away: { name: g.teams.away.name, logo: g.teams.away.logo ?? '', score: as, winner: state === 'Final' && as != null && hs != null && as > hs },
      home: { name: g.teams.home.name, logo: g.teams.home.logo ?? '', score: hs, winner: state === 'Final' && as != null && hs != null && hs > as },
    };
  });
}

/* ───────────── 足球來源 ───────────── */
/** 友誼賽（專屬 /sports/friendlies/matches，有中文名+真 logo） */
interface FriendlyMatch {
  id: number;
  kickoffAt: string;
  home: { nameZh: string; nameEn: string; logoUrl: string | null };
  away: { nameZh: string; nameEn: string; logoUrl: string | null };
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'live' | 'finished';
  liveMinute: number | null;
}
function normalizeFriendly(matches: FriendlyMatch[]): HubGame[] {
  const meta = FOOTBALL_LEAGUES[0]; // friendlies
  return matches.map((m) => {
    const state: GameState = m.status === 'finished' ? 'Final' : m.status === 'live' ? 'Live' : 'Preview';
    const detail = state === 'Live' ? (m.liveMinute != null ? `${m.liveMinute}'` : '進行中') : state === 'Final' ? '終' : twTime(m.kickoffAt);
    const hs = m.homeScore;
    const as = m.awayScore;
    return {
      key: `friendlies-${m.id}`,
      league: 'friendlies',
      badge: meta.badge,
      badgeCls: meta.badgeCls,
      state,
      href: `/match/friendly/${m.id}`,
      detail,
      away: { name: m.away.nameZh, logo: m.away.logoUrl ?? '', score: as, winner: state === 'Final' && as != null && hs != null && as > hs },
      home: { name: m.home.nameZh, logo: m.home.logoUrl ?? '', score: hs, winner: state === 'Final' && as != null && hs != null && hs > as },
    };
  });
}
/** 其他足球聯賽（通用 /sports/:slug/recent，api-sports football fixture） */
interface FootballFixture {
  fixture?: { id?: number; date?: string; status?: { short?: string; elapsed?: number | null } };
  id?: number;
  date?: string;
  timestamp?: number;
  statusShort?: string;
  teams?: { home?: { name?: string; nameZhTw?: string; logo?: string }; away?: { name?: string; nameZhTw?: string; logo?: string } };
  goals?: { home?: number | null; away?: number | null };
}
const FB_LIVE = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT']);
const FB_FINAL = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
function fbState(short?: string): GameState {
  const s = (short ?? 'NS').toUpperCase();
  if (FB_FINAL.has(s)) return 'Final';
  if (FB_LIVE.has(s)) return 'Live';
  return 'Preview';
}
function normalizeFootballGeneric(games: FootballFixture[], meta: { slug: string; badge: string; badgeCls: string }): HubGame[] {
  return games.map((g) => {
    const short = g.fixture?.status?.short ?? g.statusShort;
    const state = fbState(short);
    const elapsed = g.fixture?.status?.elapsed;
    const iso = g.fixture?.date ?? (g.timestamp ? new Date(g.timestamp * 1000).toISOString() : g.date);
    const detail = state === 'Live' ? (elapsed != null ? `${elapsed}'` : '進行中') : state === 'Final' ? '終' : twTime(iso);
    const hs = g.goals?.home ?? null;
    const as = g.goals?.away ?? null;
    const id = g.fixture?.id ?? g.id;
    const tn = (t?: { name?: string; nameZhTw?: string }) => t?.nameZhTw || t?.name || '未知';
    return {
      key: `${meta.slug}-${id}`,
      league: meta.slug,
      badge: meta.badge,
      badgeCls: meta.badgeCls,
      state,
      href: `/board/${meta.slug}`,
      detail,
      away: { name: tn(g.teams?.away), logo: g.teams?.away?.logo ?? '', score: as, winner: state === 'Final' && as != null && hs != null && as > hs },
      home: { name: tn(g.teams?.home), logo: g.teams?.home?.logo ?? '', score: hs, winner: state === 'Final' && as != null && hs != null && hs > as },
    };
  });
}

/* ───────────── 單列賽事（條列式） ───────────── */
/** 隊徽圖（載入失敗即隱藏，保留佔位寬度避免位移） */
function TeamLogo({ src }: { src: string }) {
  if (!src) return <span className="w-5 h-5 shrink-0" />;
  return (
    <img
      src={src}
      alt=""
      className="w-5 h-5 object-contain shrink-0"
      onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
    />
  );
}

/**
 * 單列賽事 — 友誼賽式條列（單欄 divide-y、grid 對齊、左色條標 LIVE）
 * grid：狀態(56px) │ 客隊(1fr 靠右) │ 比分(60px 置中) │ 主隊(1fr 靠左)
 * 跨聯盟模式狀態欄改顯示聯盟 badge + 局數/時間。
 */
function GameRow({ g, crossLeague = false }: { g: HubGame; crossLeague?: boolean }) {
  const isLive = g.state === 'Live';
  const isFinal = g.state === 'Final';

  const bar = isLive ? 'border-l-[3px] border-l-red-500' : 'border-l-[3px] border-l-transparent';

  // 比分色：Live 兩隊紅；Final 贏家黑、輸家灰
  const scoreCls = (t: HubTeam) =>
    isLive ? 'text-red-600' : isFinal ? (t.winner ? 'text-gray-900' : 'text-gray-400') : 'text-gray-300';
  // 隊名色：Final 贏家黑粗、輸家灰；其餘正常
  const nameCls = (t: HubTeam) =>
    isFinal ? (t.winner ? 'text-gray-900 font-semibold' : 'text-gray-400') : 'text-gray-700';

  return (
    <Link
      href={g.href}
      className={`grid grid-cols-[56px_1fr_minmax(56px,max-content)_1fr] items-center gap-2 ${bar} pl-2.5 pr-3 py-2 hover:bg-gray-50 transition-colors`}
    >
      {/* ① 狀態欄：跨聯盟顯示聯盟 badge + 局數/時間；單聯盟顯示狀態 */}
      {crossLeague ? (
        <div className="flex flex-col items-start gap-0.5 min-w-0">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${g.badgeCls}`}>{g.badge}</span>
          <span className={`text-[10px] tabular-nums leading-none ${isLive ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
            {g.detail}
          </span>
        </div>
      ) : (
        <span className={`text-[11px] tabular-nums whitespace-nowrap ${isLive ? 'text-red-600 font-semibold' : isFinal ? 'text-gray-400' : 'text-gray-500'}`}>
          {g.detail}
        </span>
      )}

      {/* ② 客隊（靠右貼比分） */}
      <div className="flex items-center justify-end gap-1.5 min-w-0">
        <span className={`truncate text-sm text-right ${nameCls(g.away)}`}>{g.away.name}</span>
        <TeamLogo src={g.away.logo} />
      </div>

      {/* ③ 比分（置中） */}
      <div className="flex items-center justify-center gap-1 tabular-nums">
        {g.state === 'Preview' ? (
          <span className="text-xs text-gray-300">vs</span>
        ) : (
          <>
            <span className={`text-sm font-bold ${scoreCls(g.away)}`}>{g.away.score ?? '-'}</span>
            <span className="text-gray-300 text-xs">:</span>
            <span className={`text-sm font-bold ${scoreCls(g.home)}`}>{g.home.score ?? '-'}</span>
          </>
        )}
      </div>

      {/* ④ 主隊（靠左貼比分） */}
      <div className="flex items-center justify-start gap-1.5 min-w-0">
        <TeamLogo src={g.home.logo} />
        <span className={`truncate text-sm ${nameCls(g.home)}`}>{g.home.name}</span>
      </div>
    </Link>
  );
}

/* ───────────── 三狀態分組區塊 ───────────── */
const STATE_GROUPS: { state: GameState; title: string; accent: string }[] = [
  { state: 'Live', title: '進行中', accent: 'text-red-600' },
  { state: 'Preview', title: '尚未開賽', accent: 'text-blue-600' },
  { state: 'Final', title: '已結束', accent: 'text-gray-500' },
];

function ThreeStateList({
  games,
  isLoading,
  crossLeague = false,
}: {
  games: HubGame[];
  isLoading: boolean;
  crossLeague?: boolean;
}) {
  if (isLoading) {
    return <div className="px-4 py-10 text-center text-sm text-gray-400">載入賽事中…</div>;
  }
  if (games.length === 0) {
    return <div className="px-4 py-10 text-center text-sm text-gray-400">本日無賽事</div>;
  }
  return (
    <div className="p-3 space-y-3">
      {STATE_GROUPS.map((grp) => {
        const list = games.filter((g) => g.state === grp.state);
        if (list.length === 0) return null;
        return (
          <div key={grp.state}>
            {/* 分段標題（狀態用排序分段取代 tab） */}
            <div className="flex items-center gap-2 mb-1.5 px-0.5">
              <span className={`text-xs font-bold ${grp.accent}`}>{grp.title}</span>
              <span className="text-[11px] text-gray-400">{list.length} 場</span>
              <span className="flex-1 h-px bg-gray-100" />
            </div>
            {/* 單欄條列（友誼賽式） */}
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white overflow-hidden">
              {list.map((g) => (
                <GameRow key={g.key} g={g} crossLeague={crossLeague} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── 全部聯盟並行抓取（toggle 模式用） ───────────── */
function useAllLeaguesGames(dateKey: DateKey, enabled: boolean): { games: HubGame[]; isLoading: boolean } {
  const offset = DATE_TABS.find((t) => t.key === dateKey)!.offset;
  const date = twDate(offset);

  const { data: mlbTr } = useQuery({
    queryKey: ['mlb-team-translations'],
    queryFn: async () => {
      const res = await apiFetch<{ data: Array<{ id: number; nameZhTw: string; shortName?: string }> }>('/mlb/teams');
      return new Map(res.data.map((t) => [t.id, { id: t.id, nameZhTw: t.nameZhTw, shortName: t.shortName }]));
    },
    staleTime: 24 * 60 * 60 * 1000,
    enabled,
  });

  // 與 useHubGames 共用 queryKey → 快取共享、不重複抓
  const results = useQueries({
    queries: LEAGUES.map((l) => ({
      queryKey:
        l.slug === 'mlb' ? ['hub-mlb-schedule', date] : ['hub-baseball-schedule', l.slug, date],
      queryFn: async () => {
        if (l.slug === 'mlb') {
          const res = await apiFetch<{ data: MlbGame[] }>(`/mlb/schedule/tw?date=${date}`);
          return res.data ?? [];
        }
        const res = await apiFetch<{ data: ApiGame[] }>(`/baseball/${l.slug}/games/tw?date=${date}`);
        return res.data ?? [];
      },
      staleTime: 15 * 1000,
      refetchInterval: 20 * 1000,
      enabled,
    })),
  });

  const isLoading = enabled && results.some((r) => r.isLoading);
  const games: HubGame[] = LEAGUES.flatMap((l, i) => {
    const raw = results[i].data;
    if (!raw) return [];
    return l.slug === 'mlb'
      ? normalizeMlb(raw as MlbGame[], mlbTr ?? new Map())
      : normalizeGeneric(raw as ApiGame[], l.slug);
  });
  return { games, isLoading };
}

/* ───────────── 籃球（NBA）抓取 ───────────── */
function useBasketballGames(dateKey: DateKey, enabled: boolean): { games: HubGame[]; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['hub-nba-recent'],
    queryFn: async () => {
      const res = await apiFetch<{ data: { yesterday: NbaRecentGame[]; today: NbaRecentGame[]; tomorrow: NbaRecentGame[] } }>(
        '/sports/nba/recent',
      );
      return res.data;
    },
    staleTime: 15 * 1000,
    refetchInterval: 20 * 1000,
    enabled,
  });
  const bucket = dateKey === 'yesterday' ? data?.yesterday : dateKey === 'tomorrow' ? data?.tomorrow : data?.today;
  return { games: normalizeNba(bucket ?? []), isLoading: enabled && isLoading };
}

/* ───────────── 足球抓取（友誼賽專屬 + 其他聯賽通用，依日期合併） ───────────── */
function useFootballGames(dateKey: DateKey, enabled: boolean): { games: HubGame[]; isLoading: boolean } {
  const offset = DATE_TABS.find((t) => t.key === dateKey)!.offset;
  const date = twDate(offset);

  // 友誼賽（專屬 endpoint，依台灣日期查）
  const { data: friendly, isLoading: fLoading } = useQuery({
    queryKey: ['hub-friendlies', date],
    queryFn: async () => {
      const res = await apiFetch<{ data: FriendlyMatch[] }>(`/sports/friendlies/matches?date=${date}`);
      return res.data ?? [];
    },
    staleTime: 15 * 1000,
    refetchInterval: 20 * 1000,
    enabled,
  });

  // 其他足球聯賽（通用 recent，依日期 bucket）
  const genericLeagues = FOOTBALL_LEAGUES.filter((l) => l.source === 'generic');
  const results = useQueries({
    queries: genericLeagues.map((l) => ({
      queryKey: ['hub-football-recent', l.slug],
      queryFn: async () => {
        const res = await apiFetch<{ data: { yesterday: FootballFixture[]; today: FootballFixture[]; tomorrow: FootballFixture[] } }>(
          `/sports/${l.slug}/recent`,
        );
        return res.data;
      },
      staleTime: 30 * 1000,
      refetchInterval: 60 * 1000,
      enabled,
    })),
  });

  const isLoading = enabled && (fLoading || results.some((r) => r.isLoading));
  const games: HubGame[] = [
    ...normalizeFriendly(friendly ?? []),
    ...genericLeagues.flatMap((l, i) => {
      const d = results[i].data;
      if (!d) return [];
      const bucket = dateKey === 'yesterday' ? d.yesterday : dateKey === 'tomorrow' ? d.tomorrow : d.today;
      return normalizeFootballGeneric(bucket ?? [], l);
    }),
  ];
  return { games, isLoading };
}

/* ───────────── 熱門討論精簡列 ───────────── */
interface PostItem {
  id: string;
  title: string;
  content?: string;
  isPinned?: boolean;
  createdAt: string;
  lastReplyAt: string | null;
  pushCount: number;
  author: { id: string; nickname: string; avatar: string | null; role: string };
  tags: { tag: { id: string; name: string; slug: string } }[];
  _count: { replies: number; pushes: number };
}
interface BoardPostsResponse {
  data: { news: PostItem[]; featured: PostItem[]; discussion: { items: PostItem[]; total: number } };
}
/** 跨聯盟貼文：附上所屬聯盟 badge */
type HubPost = PostItem & { badge: string; badgeCls: string; league: string };

/** 跨聯盟討論/新聞要掃的看板＝5 聯盟 + 通用「棒球」總版 */
const POST_BOARDS: { slug: string; badge: string; badgeCls: string }[] = [
  ...LEAGUES.map((l) => ({ slug: l.slug, badge: l.badge, badgeCls: l.badgeCls })),
  { slug: 'baseball', badge: '棒球', badgeCls: 'bg-emerald-50 text-emerald-700' },
];

/**
 * 全部聯盟「最新新聞 + 熱門討論」並行抓取
 *  - 新聞：各看板 news 合併、按建立時間倒序
 *  - 熱門：各看板 discussion 合併、濾掉各板置頂、按「回覆數」排序（熱門＝多少人在聊）
 *  - 任一看板失敗靜默缺席，不拖垮其餘
 */
function useAllLeaguesPosts(enabled: boolean): { news: HubPost[]; hot: HubPost[]; isLoading: boolean } {
  const results = useQueries({
    queries: POST_BOARDS.map((b) => ({
      queryKey: ['hub-all-posts', b.slug],
      queryFn: () => apiFetch<BoardPostsResponse>(`/boards/${b.slug}/posts?limit=20&sort=popular`),
      staleTime: 60 * 1000,
      enabled,
    })),
  });
  const isLoading = enabled && results.some((r) => r.isLoading);
  const tag = (p: PostItem, b: (typeof POST_BOARDS)[number]): HubPost => ({
    ...p,
    badge: b.badge,
    badgeCls: b.badgeCls,
    league: b.slug,
  });
  const allNews = POST_BOARDS.flatMap((b, i) => (results[i].data?.data.news ?? []).map((p) => tag(p, b)));
  const allHot = POST_BOARDS.flatMap((b, i) => (results[i].data?.data.discussion.items ?? []).map((p) => tag(p, b)));
  const news = [...allNews].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 4);
  const hot = allHot
    .filter((p) => !p.isPinned) // 洗掉各板置頂公告，避免首頁熱門變成公告集合
    .sort((a, b) => b._count.replies - a._count.replies) // 熱門＝回覆數
    .slice(0, 7);
  return { news, hot, isLoading };
}
function relTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return '剛剛';
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(iso).toLocaleDateString('zh-TW');
}
function HotRow({ post, rank, badge, badgeCls }: { post: PostItem; rank: number; badge?: string; badgeCls?: string }) {
  const replies = post._count.replies;
  const isHot = replies >= 20; // 熱門＝回覆數（與顯示一致）
  return (
    <Link href={`/post/${post.id}`} className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-50 transition-colors">
      <span className={`shrink-0 w-6 text-center text-sm font-bold tabular-nums ${rank <= 3 ? 'text-blue-600' : 'text-gray-300'}`}>
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {badge && (
            <span className={`shrink-0 text-[10px] px-1 rounded font-bold leading-none ${badgeCls}`}>{badge}</span>
          )}
          {isHot && (
            <span className="shrink-0 text-[10px] bg-gradient-to-r from-orange-400 to-red-500 text-white px-1.5 py-0.5 rounded-full font-medium leading-none">
              🔥 熱
            </span>
          )}
          <span className="truncate text-sm text-gray-800 group-hover:text-blue-600 transition-colors">{post.title}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
          <span className="truncate max-w-[8rem]">{post.author.nickname}</span>
          <span>·</span>
          <span>{relTime(post.lastReplyAt ?? post.createdAt)}</span>
        </div>
      </div>
      <span className="shrink-0 flex items-center gap-1 text-xs text-gray-500 tabular-nums">
        <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.3-3.9C3.5 15 3 13.6 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {replies}
      </span>
    </Link>
  );
}

/* ───────────── 主元件 ───────────── */
export function HomeBaseballHub() {
  // 運動別主切換（Phase 2：棒球/籃球/足球）
  const [sport, setSport] = useState<SportKey>('baseball');
  // 選中聯盟：'all' 或聯盟 slug（切運動時重置為 all）
  const [leagueSel, setLeagueSel] = useState<string>('all');
  const [dateKey, setDateKey] = useState<DateKey>('today');
  // 右欄棒球競猜面板的聯盟（MLB / CPBL 切換，預設 MLB）
  const [panelLeague, setPanelLeague] = useState<'mlb' | 'cpbl'>('mlb');

  const switchSport = (s: SportKey) => { setSport(s); setLeagueSel('all'); };

  // 三運動各自抓取（enabled 依當前運動別；只跑當前運動的查詢）
  const { games: bbGames, isLoading: bbLoading } = useAllLeaguesGames(dateKey, sport === 'baseball');
  const { games: bkGames, isLoading: bkLoading } = useBasketballGames(dateKey, sport === 'basketball');
  const { games: fbGames, isLoading: fbLoading } = useFootballGames(dateKey, sport === 'football');

  // 當前運動的聯盟清單 + 全部場次
  const sportLeagues = sport === 'baseball' ? LEAGUES : sport === 'basketball' ? BASKETBALL_LEAGUES : FOOTBALL_LEAGUES;
  const sportGamesAll = sport === 'baseball' ? bbGames : sport === 'basketball' ? bkGames : fbGames;
  const displayLoading = sport === 'baseball' ? bbLoading : sport === 'basketball' ? bkLoading : fbLoading;

  // 依選中聯盟過濾（'all' 不過濾）
  const displayGames = leagueSel === 'all' ? sportGamesAll : sportGamesAll.filter((g) => g.league === leagueSel);
  // 多聯盟聚合時，列上顯示聯盟 badge
  const crossLeague = leagueSel === 'all' && sportLeagues.length > 1;
  const liveCount = sportGamesAll.filter((g) => g.state === 'Live').length;

  // masthead「討論區」連結（依運動別 / 選中聯盟）
  const sportLabel = SPORTS.find((s) => s.key === sport)!.label;
  const sportBoard =
    leagueSel !== 'all'
      ? `/board/${leagueSel}`
      : sport === 'baseball'
        ? '/board/baseball'
        : sport === 'basketball'
          ? '/board/nba'
          : '/board/friendlies';

  // ── 下半部固定為「棒球專區」（與上半部運動別解耦）──
  const baseballSingle = sport === 'baseball' && leagueSel !== 'all' ? leagueSel : null;
  const { data: posts, isLoading: postsLoading } = useQuery({
    queryKey: ['hub-board-posts', baseballSingle],
    queryFn: () => apiFetch<BoardPostsResponse>(`/boards/${baseballSingle}/posts?limit=20&sort=popular`),
    staleTime: 60 * 1000,
    enabled: !!baseballSingle,
  });
  const { news: crossNews, hot: crossHot, isLoading: crossPostsLoading } = useAllLeaguesPosts(true);

  const news: (PostItem | HubPost)[] = baseballSingle ? posts?.data.news ?? [] : crossNews;
  const hot: (PostItem | HubPost)[] = baseballSingle ? posts?.data.discussion.items ?? [] : crossHot;
  const postsBusy = baseballSingle ? postsLoading : crossPostsLoading;

  // 下半部主詞（永遠棒球）：單聯盟→該聯盟名；否則「棒球」
  const sectionLabel = baseballSingle ? LEAGUES.find((l) => l.slug === baseballSingle)!.label : '棒球';
  const boardHref = baseballSingle ? `/board/${baseballSingle}` : '/board/baseball';

  return (
    <section className="mb-10">
      {/* masthead：聚焦深 teal，棒球賽事中心 + 聯盟切換 */}
      <div className="rounded-t-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500 px-5 pt-3.5 pb-2">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2 leading-tight">
              <span>{SPORTS.find((s) => s.key === sport)!.icon}</span>
              <span>即時賽事</span>
              {liveCount > 0 && (
                <span className="flex items-center gap-1 text-xs bg-red-500/90 text-white px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  {liveCount} LIVE
                </span>
              )}
            </h2>
            <p className="text-xs text-blue-100 mt-0.5">點任一場進去看戰報、邊看邊聊</p>
          </div>
          <Link
            href={sportBoard}
            className="shrink-0 text-xs sm:text-sm font-medium text-white bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
          >
            {sportLabel}討論區 →
          </Link>
        </div>
        {/* 運動別主切換（棒球/籃球/足球） */}
        <div className="flex items-center gap-1.5 mb-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {SPORTS.map((s) => {
            const active = sport === s.key;
            const live = active ? liveCount : 0;
            return (
              <button
                key={s.key}
                onClick={() => switchSport(s.key)}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-bold transition-colors ${
                  active ? 'bg-white text-blue-700 shadow-sm' : 'text-blue-50 hover:bg-white/15'
                }`}
              >
                <span>{s.icon}</span>
                {s.label}
                {live > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
              </button>
            );
          })}
        </div>

        {/* 聯盟切換（依當前運動別）：全部聯盟（預設）+ 分隔 + 各聯盟 */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1">
          <button
            onClick={() => setLeagueSel('all')}
            className={`shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              leagueSel === 'all' ? 'bg-white text-blue-700' : 'text-blue-50 hover:bg-white/15'
            }`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M3 12h18M12 3c2.5 2.5 4 5.6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.6-4-9s1.5-6.5 4-9z" />
            </svg>
            全部聯盟
          </button>
          <span className="mx-1 h-4 w-px bg-white/25 shrink-0" />
          {sportLeagues.map((l) => (
            <button
              key={l.slug}
              onClick={() => setLeagueSel(l.slug)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                leagueSel === l.slug
                  ? 'bg-white text-blue-700'
                  : leagueSel === 'all'
                    ? 'text-blue-200/70 hover:bg-white/10'
                    : 'text-blue-50 hover:bg-white/15'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* 賽事條列卡片 */}
      <div className="rounded-b-2xl border border-t-0 border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* 日期切換（兩種模式都保留） */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100">
          {DATE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setDateKey(t.key)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                dateKey === t.key ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {t.label} {twDateLabel(t.offset)}
            </button>
          ))}
        </div>

        {/* 狀態用分段排序呈現（進行中→尚未開賽→已結束），不再用狀態子 tab */}
        <ThreeStateList games={displayGames} isLoading={displayLoading} crossLeague={crossLeague} />
      </div>

      {/* 雙欄：左 新聞+熱門討論 / 右 數據面板（主詞跟著上半部模式走） */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2 space-y-6">
          {news.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-sm font-bold text-blue-600">📰 {sectionLabel}最新新聞</span>
                <Link href={boardHref} className="text-xs text-gray-400 hover:text-blue-600">更多 →</Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {news.slice(0, 4).map((post) => (
                  <div key={post.id} className="relative">
                    {!baseballSingle && (post as HubPost).badge && (
                      <span className={`absolute top-1.5 right-1.5 z-10 px-1 rounded text-[10px] font-bold leading-none pointer-events-none ${(post as HubPost).badgeCls}`}>
                        {(post as HubPost).badge}
                      </span>
                    )}
                    <FeaturedPostCard post={post} />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-sm font-bold text-blue-600">🔥 {sectionLabel}熱門討論</span>
              <Link href={boardHref} className="text-xs text-gray-400 hover:text-blue-600">全部討論 →</Link>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-50 py-1">
              {postsBusy ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">載入中…</div>
              ) : hot.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  還沒有人開聊，
                  <Link href={boardHref} className="text-blue-600 hover:underline">搶頭香 →</Link>
                </div>
              ) : (
                hot.slice(0, 7).map((post, i) => (
                  <HotRow
                    key={post.id}
                    post={post}
                    rank={i + 1}
                    badge={!baseballSingle ? (post as HubPost).badge : undefined}
                    badgeCls={!baseballSingle ? (post as HubPost).badgeCls : undefined}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* 右窄欄：本週會員競猜排行（會員競猜功能開發中，先保留版位） */}
        <aside className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* 標題 */}
            <div className="px-3 py-2.5 border-b border-gray-100 bg-gradient-to-r from-accent-50 to-white flex items-center gap-2">
              <span>🏆</span>
              <h3 className="font-bold text-sm text-gray-800">本週競猜排行</h3>
              <span className="ml-auto text-[10px] text-accent-500 bg-accent-50 px-1.5 py-0.5 rounded-full font-medium">
                即將開放
              </span>
            </div>
            {/* MLB / 中職 切換 */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-50">
              {([['mlb', 'MLB'], ['cpbl', '中職']] as const).map(([slug, label]) => (
                <button
                  key={slug}
                  onClick={() => setPanelLeague(slug)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    panelLeague === slug ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* 前三名版位（會員競猜資料待開發，先放骨架） */}
            <div className="p-3 space-y-2">
              {[
                { rank: 1, medal: '🥇' },
                { rank: 2, medal: '🥈' },
                { rank: 3, medal: '🥉' },
              ].map((r) => (
                <div key={r.rank} className="flex items-center gap-3 px-2.5 py-2 rounded-lg bg-gray-50/70">
                  <span className="text-base leading-none">{r.medal}</span>
                  <div className="flex-1 min-w-0">
                    <div className="h-2.5 w-20 bg-gray-200 rounded-full" />
                  </div>
                  <span className="text-xs text-gray-300 tabular-nums">-- 分</span>
                </div>
              ))}
              <p className="text-center text-[11px] text-gray-400 leading-relaxed pt-1">
                會員競猜即將開放
                <br />
                登入後競猜本週 {panelLeague === 'mlb' ? 'MLB' : '中職'} 賽事、比準度衝上排行榜
              </p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
