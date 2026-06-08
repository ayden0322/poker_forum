'use client';

/**
 * 國際足球友誼賽 2026 — 板塊主視覺
 *
 * 設計方向（設計顧問）：
 * - 主軸按「日期」，不是國家隊/洲際；無小組積分榜（友誼賽沒有晉級結構）
 * - Hero 走「常態運轉」語氣：本季 X 場 · 今日 Y 場 · LIVE Z 場（非大賽倒數）
 * - 三狀態視覺層次：LIVE 唯一彩色邊框+動效；焦點戰=卡片；一般完賽場=緊湊列表行
 * - 卡片層不放賠率（保持內容站調性）；用真 logo（next/image）
 * - 資料來源：/sports/friendlies/timeline、/sports/friendlies/overview
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import Image from 'next/image';
import { useMemo, useState } from 'react';

interface TeamView {
  id: number;
  apiTeamId: number;
  nameEn: string;
  nameZh: string;
  logoUrl: string | null;
  isMarquee: boolean;
}

interface Match {
  id: number;
  round: string | null;
  kickoffAt: string;
  venue: string | null;
  venueCity: string | null;
  home: TeamView;
  away: TeamView;
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'live' | 'finished';
  liveMinute: number | null;
  isFeatured: boolean;
}

interface DateGroup {
  date: string;
  weekday: string;
  matches: Match[];
}

interface Overview {
  season: number;
  total: number;
  today: number;
  live: number;
  featured: number;
}

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'featured', label: '焦點戰' },
  { key: 'live', label: 'LIVE' },
  { key: 'today', label: '今日' },
  { key: 'week', label: '本週' },
  { key: 'finished', label: '近期完賽' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** 台灣今天 YYYY-MM-DD */
function twToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}
function twDatePlus(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}
function twTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
function twDateLabel(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/** 隊名顯示：中文（英文）；尚未翻譯時退回英文 */
function teamLabel(t: TeamView): string {
  return t.nameZh && t.nameZh !== t.nameEn ? `${t.nameZh}（${t.nameEn}）` : t.nameEn;
}

function queryForTab(tab: TabKey): string {
  const today = twToday();
  switch (tab) {
    case 'all':
      // 資訊完整為主：焦點戰與一般場一起，近期 + 未來都顯示
      return `from=${twDatePlus(-14)}&to=${twDatePlus(30)}`;
    case 'featured':
      return `featured=true&from=${twDatePlus(-3)}`;
    case 'live':
      return `status=live`;
    case 'today':
      return `from=${today}&to=${today}`;
    case 'week':
      return `status=scheduled&from=${today}&to=${twDatePlus(7)}`;
    case 'finished':
      return `status=finished&from=${twDatePlus(-10)}&to=${today}`;
  }
}

/** 隊伍 logo（缺圖用灰圓 placeholder，不用 emoji） */
function TeamLogo({ url }: { url: string | null }) {
  return url ? (
    <Image src={url} alt="" width={18} height={18} className="w-[18px] h-[18px] object-contain flex-shrink-0" />
  ) : (
    <span className="w-[18px] h-[18px] rounded-full bg-gray-100 flex-shrink-0" />
  );
}

/**
 * 統一賽事列（焦點戰 / LIVE / 一般場共用同一容器）
 * 版面：grid [時間 56px | 主隊 1fr 靠右 | 比分 64px | 客隊 1fr 靠左]
 * 焦點戰/LIVE 只用「左色條 + 字重 + 🔥」區分，不另開卡片，避免左右開天窗與孤兒卡。
 */
function MatchRow({ m }: { m: Match }) {
  const isFinal = m.status === 'finished';
  const isLive = m.status === 'live';
  const isFeatured = m.isFeatured;
  const hs = m.homeScore;
  const as = m.awayScore;
  const homeWins = isFinal && hs != null && as != null && hs > as;
  const awayWins = isFinal && hs != null && as != null && as > hs;

  const bar = isLive
    ? 'border-l-[3px] border-l-red-500'
    : isFeatured
      ? 'border-l-[3px] border-l-amber-400'
      : 'border-l-[3px] border-l-transparent';
  const nameBase = isFeatured ? 'font-semibold text-gray-900' : 'text-gray-600';

  return (
    <Link
      href={`/match/friendly/${m.id}`}
      className={`grid grid-cols-[52px_1fr_60px_1fr] items-center gap-2 ${bar} pl-2.5 pr-3 ${isFeatured || isLive ? 'py-2.5' : 'py-2'} hover:bg-gray-50 transition-colors text-sm`}
    >
      {/* 時間 / 狀態 */}
      <span className="text-[11px] tabular-nums whitespace-nowrap">
        {isLive ? (
          <span className="text-red-500 font-bold flex items-center gap-0.5">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            {m.liveMinute != null ? `${m.liveMinute}'` : 'LIVE'}
          </span>
        ) : isFinal ? (
          <span className="text-gray-400">FT</span>
        ) : (
          <span className="text-gray-500">{twTime(m.kickoffAt)}</span>
        )}
      </span>

      {/* 主隊：靠右貼比分 */}
      <div className="flex items-center gap-1.5 min-w-0 justify-end">
        {isFeatured && <span className="text-amber-500 text-[11px] flex-shrink-0">🔥</span>}
        <span className={`truncate text-right ${homeWins ? 'font-bold text-gray-900' : nameBase}`} title={teamLabel(m.home)}>
          {m.home.nameZh}
        </span>
        <TeamLogo url={m.home.logoUrl} />
      </div>

      {/* 比分 */}
      <span
        className={`text-center tabular-nums font-semibold ${
          isLive ? 'text-red-600' : isFinal ? 'text-gray-900' : 'text-gray-300 text-xs font-normal'
        }`}
      >
        {isFinal || isLive ? `${hs ?? 0}-${as ?? 0}` : 'vs'}
      </span>

      {/* 客隊：靠左貼比分 */}
      <div className="flex items-center gap-1.5 min-w-0">
        <TeamLogo url={m.away.logoUrl} />
        <span className={`truncate ${awayWins ? 'font-bold text-gray-900' : nameBase}`} title={teamLabel(m.away)}>
          {m.away.nameZh}
        </span>
      </div>
    </Link>
  );
}

export function FriendlyActivityStrip() {
  const [tab, setTab] = useState<TabKey>('today');

  const { data: overviewData } = useQuery({
    queryKey: ['friendlies-overview'],
    queryFn: () => apiFetch<{ data: Overview }>('/sports/friendlies/overview'),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const ov = overviewData?.data;

  const { data, isLoading } = useQuery({
    queryKey: ['friendlies-timeline', tab],
    queryFn: () => apiFetch<{ data: DateGroup[] }>(`/sports/friendlies/timeline?${queryForTab(tab)}`),
    staleTime: 60_000,
    refetchInterval: tab === 'live' ? 30_000 : 5 * 60_000,
  });

  const groups = useMemo(() => {
    const list = data?.data ?? [];
    // 近期完賽：最新日期在前
    return tab === 'finished' ? [...list].reverse() : list;
  }, [data, tab]);

  return (
    <div className="mb-4">
      {/* Hero：常態運轉語氣 */}
      <div className="rounded-xl bg-gradient-to-r from-[#39B8BE] to-[#2C8E93] text-white px-4 py-3 mb-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤝</span>
          <div>
            <h2 className="font-bold text-base leading-tight">國際足球友誼賽</h2>
            <p className="text-[11px] text-white/80 leading-tight">2026 賽季 · 國家隊熱身賽</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-center">
          <div>
            <div className="font-bold text-lg leading-none tabular-nums">{ov?.total ?? '—'}</div>
            <div className="text-[10px] text-white/75">本季場次</div>
          </div>
          <div>
            <div className="font-bold text-lg leading-none tabular-nums">{ov?.today ?? '—'}</div>
            <div className="text-[10px] text-white/75">今日</div>
          </div>
          <div>
            <div className={`font-bold text-lg leading-none tabular-nums flex items-center gap-1 justify-center ${ov?.live ? 'text-amber-200' : ''}`}>
              {ov?.live ? <span className="w-1.5 h-1.5 bg-amber-200 rounded-full animate-pulse" /> : null}
              {ov?.live ?? 0}
            </div>
            <div className="text-[10px] text-white/75">LIVE</div>
          </div>
        </div>
      </div>

      {/* 狀態快切 Tab */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto scrollbar-hide">
        {TABS.map((t) => {
          const active = tab === t.key;
          const showLiveDot = t.key === 'live' && (ov?.live ?? 0) > 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                active ? 'bg-[#39B8BE] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {showLiveDot && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
              {t.label}
              {t.key === 'live' && (ov?.live ?? 0) > 0 && <span>({ov?.live})</span>}
            </button>
          );
        })}
      </div>

      {/* 日期時間軸 */}
      {isLoading ? (
        <div className="text-center text-xs text-gray-400 py-8">載入中...</div>
      ) : groups.length === 0 ? (
        <div className="text-center text-xs text-gray-400 py-8">
          {TABS.find((t) => t.key === tab)?.label}目前無賽事
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.date}>
              <div className="flex items-center gap-2 mb-1.5 sticky top-0 bg-white/95 backdrop-blur py-1 z-10">
                <span className="text-sm font-bold text-gray-800">{twDateLabel(g.date)}</span>
                <span className="text-[11px] text-gray-400">週{g.weekday.replace(/週|星期/g, '')}</span>
                <span className="text-[11px] text-gray-300">·</span>
                <span className="text-[11px] text-gray-400">{g.matches.length} 場</span>
                <div className="flex-1 border-t border-gray-100" />
              </div>

              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white overflow-hidden">
                {g.matches.map((m) => (
                  <MatchRow key={m.id} m={m} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
