'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { MLBStatsPanel } from '@/components/sports/mlb/MLBStatsPanel';
import { BaseballStatsPanel } from '@/components/sports/BaseballStatsPanel';
import { BaseballStandingsWidget } from '@/components/sports/BaseballStandingsWidget';
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

/* ───────────── 聯盟設定 ───────────── */
const LEAGUES = [
  { slug: 'mlb', label: 'MLB' },
  { slug: 'cpbl', label: '中華職棒' },
  { slug: 'npb', label: '日本職棒' },
  { slug: 'kbo', label: '韓國職棒' },
  { slug: 'other-baseball', label: '其他棒球' },
] as const;
type LeagueSlug = (typeof LEAGUES)[number]['slug'];

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
  state: GameState;
  href: string;
  detail: string; // Live→局數；Preview→開賽時間；Final→「終」
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
    return {
      key: `${league}-${g.id}`,
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
 * 單列賽事 — 雷速式左右對稱、比分釘中央
 * 五欄：狀態(w-14) │ 客隊(flex-1靠右) │ 比分(w-20置中錨點) │ 主隊(flex-1靠左) │ ›
 * 顏色分狀態（紅=進行中、灰=已結束、未開賽不顯示比分）；比分顏色分勝負。
 */
function GameRow({ g }: { g: HubGame }) {
  const isLive = g.state === 'Live';
  const isFinal = g.state === 'Final';

  // 狀態欄文字色
  const statusCls = isLive ? 'text-red-600 font-semibold' : isFinal ? 'text-gray-400' : 'text-gray-500';

  // 比分色：Live 兩隊紅；Final 贏家黑、輸家灰
  const scoreCls = (t: HubTeam) =>
    isLive ? 'text-red-600' : isFinal ? (t.winner ? 'text-gray-900' : 'text-gray-400') : 'text-gray-400';

  // 隊名色：Final 贏家黑粗、輸家灰；其餘正常
  const nameCls = (t: HubTeam) =>
    isFinal ? (t.winner ? 'text-gray-900 font-semibold' : 'text-gray-400') : 'text-gray-700';

  return (
    <Link
      href={g.href}
      className="group flex items-center h-11 rounded-lg border border-gray-200 bg-white px-2 hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-sm transition-all"
    >
      {/* ① 狀態（局數 / 終 / 開賽時間） */}
      <div className={`w-11 shrink-0 text-center text-[11px] tabular-nums leading-tight ${statusCls}`}>
        {g.detail}
      </div>

      {/* ② 客隊（靠右，往中央比分夾） */}
      <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
        <span className={`truncate text-sm text-right ${nameCls(g.away)}`}>{g.away.name}</span>
        <TeamLogo src={g.away.logo} />
      </div>

      {/* ③ 比分：卡片視覺錨點，釘在正中軸 */}
      <div className="w-16 shrink-0 flex items-center justify-center gap-1 tabular-nums">
        {g.state === 'Preview' ? (
          <span className="text-sm text-gray-400">vs</span>
        ) : (
          <>
            <span className={`text-base font-bold ${scoreCls(g.away)}`}>{g.away.score ?? '-'}</span>
            <span className="text-gray-300 text-sm">:</span>
            <span className={`text-base font-bold ${scoreCls(g.home)}`}>{g.home.score ?? '-'}</span>
          </>
        )}
      </div>

      {/* ④ 主隊（靠左） */}
      <div className="flex-1 flex items-center justify-start gap-1.5 min-w-0">
        <TeamLogo src={g.home.logo} />
        <span className={`truncate text-sm ${nameCls(g.home)}`}>{g.home.name}</span>
      </div>

      {/* ⑤ chevron */}
      <div className="w-5 shrink-0 flex items-center justify-center text-gray-300 group-hover:text-blue-600 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
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

function ThreeStateList({ games, isLoading }: { games: HubGame[]; isLoading: boolean }) {
  if (isLoading) {
    return <div className="px-4 py-10 text-center text-sm text-gray-400">載入賽事中…</div>;
  }
  if (games.length === 0) {
    return <div className="px-4 py-10 text-center text-sm text-gray-400">本日無賽事</div>;
  }
  return (
    <div className="p-3 space-y-4">
      {STATE_GROUPS.map((grp) => {
        const list = games.filter((g) => g.state === grp.state);
        if (list.length === 0) return null;
        return (
          <div key={grp.state}>
            {/* 分區塊標題 */}
            <div className="flex items-center gap-2 mb-1.5 px-0.5">
              <span className={`text-xs font-bold ${grp.accent}`}>{grp.title}</span>
              <span className="text-[11px] text-gray-400">{list.length} 場</span>
              <span className="flex-1 h-px bg-gray-100" />
            </div>
            {/* 賽事卡片網格：桌機 2~3 欄並排，消除整列死白 */}
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2">
              {list.map((g) => (
                <GameRow key={g.key} g={g} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── 賽事資料抓取（依聯盟分流） ───────────── */
function useHubGames(league: LeagueSlug, dateKey: DateKey): { games: HubGame[]; isLoading: boolean } {
  const offset = DATE_TABS.find((t) => t.key === dateKey)!.offset;
  const date = twDate(offset);
  const isMlb = league === 'mlb';

  // MLB 隊名翻譯（僅 MLB 需要）
  const { data: mlbTr } = useQuery({
    queryKey: ['mlb-team-translations'],
    queryFn: async () => {
      const res = await apiFetch<{ data: Array<{ id: number; nameZhTw: string; shortName?: string }> }>('/mlb/teams');
      return new Map(res.data.map((t) => [t.id, { id: t.id, nameZhTw: t.nameZhTw, shortName: t.shortName }]));
    },
    staleTime: 24 * 60 * 60 * 1000,
    enabled: isMlb,
  });

  const { data: mlbGames, isLoading: mlbLoading } = useQuery({
    queryKey: ['hub-mlb-schedule', date],
    queryFn: async () => {
      const res = await apiFetch<{ data: MlbGame[] }>(`/mlb/schedule/tw?date=${date}`);
      return res.data ?? [];
    },
    staleTime: 15 * 1000,
    refetchInterval: 20 * 1000,
    enabled: isMlb,
  });

  const { data: genGames, isLoading: genLoading } = useQuery({
    queryKey: ['hub-baseball-schedule', league, date],
    queryFn: async () => {
      const res = await apiFetch<{ data: ApiGame[] }>(`/baseball/${league}/games/tw?date=${date}`);
      return res.data ?? [];
    },
    staleTime: 15 * 1000,
    refetchInterval: 20 * 1000,
    enabled: !isMlb,
  });

  if (isMlb) {
    const games = normalizeMlb(mlbGames ?? [], mlbTr ?? new Map());
    return { games: sortByState(games), isLoading: mlbLoading || (!!mlbGames?.length && !mlbTr) };
  }
  const games = normalizeGeneric(genGames ?? [], league);
  return { games: sortByState(games), isLoading: genLoading };
}

function sortByState(games: HubGame[]): HubGame[] {
  // 顯示順序：進行中 → 尚未開賽 → 已結束（與 STATE_GROUPS 一致）
  const rank = (s: GameState) => (s === 'Live' ? 0 : s === 'Preview' ? 1 : 2);
  return [...games].sort((a, b) => rank(a.state) - rank(b.state));
}

/* ───────────── 熱門討論精簡列 ───────────── */
interface PostItem {
  id: string;
  title: string;
  content?: string;
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
function HotRow({ post, rank }: { post: PostItem; rank: number }) {
  const replies = post._count.replies;
  const isHot = post.pushCount >= 10 || replies >= 20;
  return (
    <Link href={`/post/${post.id}`} className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-50 transition-colors">
      <span className={`shrink-0 w-6 text-center text-sm font-bold tabular-nums ${rank <= 3 ? 'text-blue-600' : 'text-gray-300'}`}>
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
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
  const [league, setLeague] = useState<LeagueSlug>('mlb');
  const [dateKey, setDateKey] = useState<DateKey>('today');

  const { games, isLoading } = useHubGames(league, dateKey);
  const liveCount = games.filter((g) => g.state === 'Live').length;

  const { data: posts, isLoading: postsLoading } = useQuery({
    queryKey: ['hub-board-posts', league],
    queryFn: () => apiFetch<BoardPostsResponse>(`/boards/${league}/posts?limit=20&sort=popular`),
    staleTime: 60 * 1000,
  });
  const news = posts?.data.news ?? [];
  const hot = posts?.data.discussion.items ?? [];

  const leagueLabel = LEAGUES.find((l) => l.slug === league)!.label;

  return (
    <section className="mb-10">
      {/* masthead：聚焦深 teal，棒球賽事中心 + 聯盟切換 */}
      <div className="rounded-t-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500 px-5 pt-3.5 pb-2">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2 leading-tight">
              <span>⚾</span>
              <span>棒球即時賽事</span>
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
            href={`/board/${league}`}
            className="shrink-0 text-xs sm:text-sm font-medium text-white bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
          >
            {leagueLabel}討論區 →
          </Link>
        </div>
        {/* 聯盟切換 */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {LEAGUES.map((l) => (
            <button
              key={l.slug}
              onClick={() => setLeague(l.slug)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                league === l.slug ? 'bg-white text-blue-700' : 'text-blue-50 hover:bg-white/15'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* 賽事條列卡片 */}
      <div className="rounded-b-2xl border border-t-0 border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* 日期切換 */}
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
        <ThreeStateList games={games} isLoading={isLoading} />
      </div>

      {/* 雙欄：左 新聞+熱門討論 / 右 數據面板 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2 space-y-6">
          {news.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-sm font-bold text-blue-600">📰 {leagueLabel}最新新聞</span>
                <Link href={`/board/${league}`} className="text-xs text-gray-400 hover:text-blue-600">更多 →</Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {news.slice(0, 4).map((post) => (
                  <FeaturedPostCard key={post.id} post={post} />
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-sm font-bold text-blue-600">🔥 {leagueLabel}熱門討論</span>
              <Link href={`/board/${league}`} className="text-xs text-gray-400 hover:text-blue-600">全部討論 →</Link>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-50 py-1">
              {postsLoading ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">載入中…</div>
              ) : hot.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  還沒有人開聊，
                  <Link href={`/board/${league}`} className="text-blue-600 hover:underline">搶頭香 →</Link>
                </div>
              ) : (
                hot.slice(0, 7).map((post, i) => <HotRow key={post.id} post={post} rank={i + 1} />)
              )}
            </div>
          </div>
        </div>

        {/* 右窄欄：數據面板（依聯盟） */}
        <aside className="lg:col-span-1">
          {league === 'mlb' ? (
            <MLBStatsPanel />
          ) : league === 'other-baseball' ? (
            <BaseballStandingsWidget league={league} />
          ) : (
            <BaseballStatsPanel league={league} />
          )}
        </aside>
      </div>
    </section>
  );
}
