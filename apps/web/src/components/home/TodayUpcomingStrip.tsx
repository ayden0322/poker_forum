'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, useRef, useCallback, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

/**
 * 即將開打 — header 下方的全棒球聯盟橫向快覽帶
 *
 * 設計（設計顧問規格）：
 *  - 位置：header 下方、首頁 h1 之上，淺底色帶（與下方青綠 masthead 區隔）
 *  - 內容：今日 + 明日「尚未開打」(Preview) 的賽事，**合併全部棒球聯盟**（MLB/中職/日職/韓職/其他）
 *  - 排序：聯盟優先（MLB→中職→日職→韓職→其他），同聯盟內開賽時間早→晚（今日早於明日）；明日場加「明日」標記
 *  - 互動：橫向滑動，桌機 hover 顯示左右箭頭、手機純觸控
 *  - 空狀態：保留帶子 + 友善文案引導往下看即時比分
 *  - 視覺重量「刻意低於」下方賽事中心：矮高度、弱標題、卡片標聯盟 badge
 */

/* ───── 聯盟設定（含 badge 配色） ───── */
const LEAGUES = [
  { slug: 'mlb', badge: 'MLB', badgeCls: 'bg-blue-50 text-blue-700' },
  { slug: 'cpbl', badge: '中職', badgeCls: 'bg-red-50 text-red-600' },
  { slug: 'npb', badge: '日職', badgeCls: 'bg-rose-50 text-rose-600' },
  { slug: 'kbo', badge: '韓職', badgeCls: 'bg-indigo-50 text-indigo-600' },
  { slug: 'other-baseball', badge: '其他', badgeCls: 'bg-gray-100 text-gray-500' },
] as const;
type LeagueSlug = (typeof LEAGUES)[number]['slug'];

/* ───── 時間工具（台灣時區） ───── */
function twDateOffset(offsetDays = 0): string {
  const tw = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  tw.setDate(tw.getDate() + offsetDays);
  const y = tw.getFullYear();
  const m = String(tw.getMonth() + 1).padStart(2, '0');
  const d = String(tw.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

/* ───── 統一賽事型別 ───── */
interface UpcomingGame {
  key: string;
  badge: string;
  badgeCls: string;
  time: string;
  startTs: number;
  href: string;
  day?: '今日' | '明日';
  away: { name: string; logo: string };
  home: { name: string; logo: string };
}

/* ───── MLB 來源 ───── */
interface MlbGame {
  gamePk: number;
  gameDate: string;
  status: { abstractGameState: string };
  teams: { away: { team: { id: number; name: string } }; home: { team: { id: number; name: string } } };
}
interface MlbTeamTr { nameZhTw: string; shortName?: string }

function normalizeMlbPreview(games: MlbGame[], tr: Map<number, MlbTeamTr>): UpcomingGame[] {
  const name = (id: number, fb: string) => tr.get(id)?.shortName ?? tr.get(id)?.nameZhTw ?? fb;
  const logo = (id: number) => `https://www.mlbstatic.com/team-logos/${id}.svg`;
  return games
    .filter((g) => g.status.abstractGameState === 'Preview')
    .map((g) => ({
      key: `mlb-${g.gamePk}`,
      badge: 'MLB',
      badgeCls: 'bg-blue-50 text-blue-700',
      time: twTime(g.gameDate),
      startTs: new Date(g.gameDate).getTime(),
      href: `/match/mlb/${g.gamePk}`,
      away: { name: name(g.teams.away.team.id, g.teams.away.team.name), logo: logo(g.teams.away.team.id) },
      home: { name: name(g.teams.home.team.id, g.teams.home.team.name), logo: logo(g.teams.home.team.id) },
    }));
}

/* ───── 通用棒球來源 ───── */
interface ApiTeam { id: number; name?: string; nameZhTw?: string; shortName?: string; logo?: string }
interface ApiGame { id: number; date?: string; timestamp?: number; statusShort?: string; teams?: { home?: ApiTeam; away?: ApiTeam } }
const LIVE_CODES = new Set(['IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'IN7', 'IN8', 'IN9', 'LIVE', 'BT', 'P1', 'P2']);
const FINAL_CODES = new Set(['FT', 'AOT', 'AET', 'CANC', 'POST']);
function isPreviewGeneric(short?: string): boolean {
  const s = (short ?? 'NS').toUpperCase();
  return !LIVE_CODES.has(s) && !FINAL_CODES.has(s);
}
function teamLabel(t?: ApiTeam): string {
  return t?.shortName || t?.nameZhTw || t?.name || '未知';
}
function normalizeGenericPreview(
  games: ApiGame[],
  league: LeagueSlug,
  badge: string,
  badgeCls: string,
): UpcomingGame[] {
  return games
    .filter((g) => isPreviewGeneric(g.statusShort))
    .map((g) => {
      const startTs = g.timestamp ? g.timestamp * 1000 : g.date ? new Date(g.date).getTime() : 0;
      return {
        key: `${league}-${g.id}`,
        badge,
        badgeCls,
        time: twTime(startTs ? new Date(startTs).toISOString() : g.date),
        startTs,
        href: `/match/baseball/${league}/${g.id}`,
        away: { name: teamLabel(g.teams?.away), logo: g.teams?.away?.logo ?? '' },
        home: { name: teamLabel(g.teams?.home), logo: g.teams?.home?.logo ?? '' },
      };
    });
}

/* ───── 隊徽（載入失敗隱藏，保留佔位） ───── */
function TeamLogo({ src }: { src: string }) {
  if (!src) return <span className="w-4 h-4 shrink-0" />;
  return (
    <img
      src={src}
      alt=""
      className="w-4 h-4 object-contain shrink-0"
      onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
    />
  );
}

/* ───── 單張即將開打卡片 ───── */
function UpcomingCard({ g }: { g: UpcomingGame }) {
  return (
    <Link
      href={g.href}
      className="group/card w-[176px] shrink-0 rounded-xl border border-gray-200 bg-white p-2.5 hover:border-blue-300 hover:shadow-md transition-all"
    >
      {/* 頂列：聯盟 badge + 開賽時間（明日場加標記） */}
      <div className="flex items-center justify-between mb-1.5">
        <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] leading-none ${g.badgeCls}`}>
          {g.badge}
        </span>
        <span className="text-xs font-bold tabular-nums text-gray-700 flex items-center gap-1">
          {g.day === '明日' && <span className="text-[9px] font-medium text-amber-600 bg-amber-50 rounded px-1 py-0.5 leading-none">明日</span>}
          {g.time || '--:--'}
        </span>
      </div>
      {/* 對戰：客隊上、主隊下 */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <TeamLogo src={g.away.logo} />
          <span className="text-xs text-gray-800 truncate">{g.away.name}</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <TeamLogo src={g.home.logo} />
          <span className="text-xs text-gray-800 truncate">{g.home.name}</span>
        </div>
      </div>
    </Link>
  );
}

/* ───── 主元件 ───── */
export function TodayUpcomingStrip() {
  const today = twDateOffset(0);
  const tomorrow = twDateOffset(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // MLB 隊名翻譯
  const { data: mlbTr } = useQuery({
    queryKey: ['mlb-team-translations'],
    queryFn: async () => {
      const res = await apiFetch<{ data: Array<{ id: number; nameZhTw: string; shortName?: string }> }>('/mlb/teams');
      return new Map(res.data.map((t) => [t.id, { nameZhTw: t.nameZhTw, shortName: t.shortName }]));
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  // 5 聯盟「今日 + 明日」賽事並行抓取（任一失敗不擋其他）
  const results = useQueries({
    queries: LEAGUES.map((l) => ({
      queryKey: ['upcoming-strip', l.slug, today, tomorrow],
      queryFn: async () => {
        if (l.slug === 'mlb') {
          const [d0, d1] = await Promise.all([
            apiFetch<{ data: MlbGame[] }>(`/mlb/schedule/tw?date=${today}`),
            apiFetch<{ data: MlbGame[] }>(`/mlb/schedule/tw?date=${tomorrow}`),
          ]);
          return [...(d0.data ?? []), ...(d1.data ?? [])];
        }
        const [d0, d1] = await Promise.all([
          apiFetch<{ data: ApiGame[] }>(`/baseball/${l.slug}/games/tw?date=${today}`),
          apiFetch<{ data: ApiGame[] }>(`/baseball/${l.slug}/games/tw?date=${tomorrow}`),
        ]);
        return [...(d0.data ?? []), ...(d1.data ?? [])];
      },
      staleTime: 60 * 1000,
    })),
  });

  const isLoading = results.some((r) => r.isLoading);

  // 依開賽時間所屬台灣日期標記今日/明日
  const dayOf = (ts: number): '今日' | '明日' =>
    new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }) === today ? '今日' : '明日';

  // 正規化 + 依聯盟順序排（MLB→中職→日職→韓職→其他棒球），同聯盟內按開賽時間（今日早於明日）
  const games: UpcomingGame[] = LEAGUES.flatMap((l, i) => {
    const raw = results[i].data;
    if (!raw) return [];
    const list =
      l.slug === 'mlb'
        ? normalizeMlbPreview(raw as MlbGame[], mlbTr ?? new Map())
        : normalizeGenericPreview(raw as ApiGame[], l.slug, l.badge, l.badgeCls);
    return list
      .sort((a, b) => a.startTs - b.startTs)
      .map((g) => ({ ...g, day: dayOf(g.startTs) }));
  });

  /* 滾動箭頭可見性 */
  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScroll, { passive: true });
    updateScroll();
    return () => el.removeEventListener('scroll', updateScroll);
  }, [updateScroll, games.length]);
  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -360 : 360, behavior: 'smooth' });
  };

  return (
    <div className="mb-5 rounded-xl bg-slate-50 border border-gray-200 px-3 py-2.5">
      {/* 標題列（刻意弱於下方 masthead） */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-gray-700">⚾ 即將開打</span>
          {games.length > 0 && <span className="text-xs text-gray-400 tabular-nums">· {games.length} 場</span>}
        </div>
      </div>

      {/* 卡片帶 */}
      {isLoading ? (
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-[176px] h-[72px] rounded-xl bg-gray-100 animate-pulse shrink-0" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-3">
          今明兩日暫無即將開打的賽事，往下看即時比分 ↓
        </div>
      ) : (
        <div className="relative group">
          {/* 左箭頭（桌機 hover） */}
          {canLeft && (
            <button
              onClick={() => scroll('left')}
              className="hidden md:flex absolute left-0 top-0 bottom-0 z-10 w-8 items-center justify-center bg-gradient-to-r from-slate-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="向左捲動"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {/* 右箭頭 */}
          {canRight && (
            <button
              onClick={() => scroll('right')}
              className="hidden md:flex absolute right-0 top-0 bottom-0 z-10 w-8 items-center justify-center bg-gradient-to-l from-slate-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="向右捲動"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          {/* 橫向捲動容器 */}
          <div
            ref={scrollRef}
            className="flex gap-2 overflow-x-auto scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {games.map((g) => (
              <UpcomingCard key={g.key} g={g} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
