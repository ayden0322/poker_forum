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

function TeamRow({ t, score, emphasize, live }: { t: TeamView; score: number | null; emphasize: boolean; live: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {t.logoUrl ? (
          <Image src={t.logoUrl} alt="" width={20} height={20} className="w-5 h-5 object-contain flex-shrink-0" />
        ) : (
          <span className="w-5 h-5 flex-shrink-0 text-center leading-5 text-gray-300">⚪</span>
        )}
        <span className={`text-sm truncate ${emphasize ? 'font-bold text-gray-900' : 'text-gray-700'}`} title={teamLabel(t)}>{teamLabel(t)}</span>
      </div>
      <span
        className={`text-sm tabular-nums flex-shrink-0 ${
          live ? 'font-bold text-red-600' : emphasize ? 'font-bold text-gray-900' : 'text-gray-400'
        }`}
      >
        {score ?? '-'}
      </span>
    </div>
  );
}

/** 焦點戰 / LIVE → 大卡片 */
function MatchCard({ m }: { m: Match }) {
  const isLive = m.status === 'live';
  const isFinal = m.status === 'finished';
  const hs = m.homeScore;
  const as = m.awayScore;
  const homeWins = isFinal && hs != null && as != null && hs > as;
  const awayWins = isFinal && hs != null && as != null && as > hs;

  const borderCls = isLive
    ? 'border-2 border-red-400 shadow-[0_0_0_3px_rgba(248,113,113,0.18)]'
    : 'border border-gray-200';

  return (
    <Link
      href={`/match/friendly/${m.id}`}
      className={`block rounded-lg ${borderCls} bg-white px-3 py-2.5 shadow-sm hover:shadow-md hover:border-[#39B8BE] transition-all`}
    >
      <div className="flex items-center justify-between mb-2 h-4">
        <span className="text-[10px] text-gray-400 truncate flex items-center gap-1">
          {m.isFeatured && <span className="text-amber-500">🔥 焦點戰</span>}
          {!m.isFeatured && <span className="truncate">{m.round ?? '國際友誼賽'}</span>}
        </span>
        {isLive ? (
          <span className="text-[10px] font-bold text-red-500 flex items-center gap-0.5 flex-shrink-0">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            LIVE{m.liveMinute != null && <span className="text-red-400 ml-0.5">{m.liveMinute}&apos;</span>}
          </span>
        ) : isFinal ? (
          <span className="text-[10px] text-gray-400 flex-shrink-0">已結束</span>
        ) : (
          <span className="text-[10px] text-gray-400 flex-shrink-0">{twTime(m.kickoffAt)} 開賽</span>
        )}
      </div>
      <div className="space-y-1.5">
        <TeamRow t={m.home} score={hs} emphasize={homeWins} live={isLive} />
        <TeamRow t={m.away} score={as} emphasize={awayWins} live={isLive} />
      </div>
    </Link>
  );
}

/** 一般完賽/未開賽場 → 緊湊列表行 */
function MatchRow({ m }: { m: Match }) {
  const isFinal = m.status === 'finished';
  const isLive = m.status === 'live';
  return (
    <Link
      href={`/match/friendly/${m.id}`}
      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 transition-colors text-sm"
    >
      <span className="w-12 flex-shrink-0 text-[11px] text-gray-400 tabular-nums">
        {isLive ? <span className="text-red-500 font-bold">LIVE</span> : isFinal ? 'FT' : twTime(m.kickoffAt)}
      </span>
      <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
        <span className="truncate text-gray-700 text-right" title={teamLabel(m.home)}>{m.home.nameZh}</span>
        {m.home.logoUrl && <Image src={m.home.logoUrl} alt="" width={16} height={16} className="w-4 h-4 object-contain flex-shrink-0" />}
      </div>
      <span className="flex-shrink-0 tabular-nums text-gray-500 font-medium w-10 text-center">
        {isFinal || isLive ? `${m.homeScore ?? 0}-${m.awayScore ?? 0}` : 'vs'}
      </span>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {m.away.logoUrl && <Image src={m.away.logoUrl} alt="" width={16} height={16} className="w-4 h-4 object-contain flex-shrink-0" />}
        <span className="truncate text-gray-700" title={teamLabel(m.away)}>{m.away.nameZh}</span>
      </div>
    </Link>
  );
}

export function FriendlyActivityStrip() {
  const [tab, setTab] = useState<TabKey>('all');

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
        <div className="space-y-4">
          {groups.map((g) => {
            const cards = g.matches.filter((m) => m.isFeatured || m.status === 'live');
            const rows = g.matches.filter((m) => !m.isFeatured && m.status !== 'live');
            return (
              <div key={g.date}>
                <div className="flex items-center gap-2 mb-2 sticky top-0 bg-white/95 backdrop-blur py-1 z-10">
                  <span className="text-sm font-bold text-gray-800">{twDateLabel(g.date)}</span>
                  <span className="text-[11px] text-gray-400">週{g.weekday.replace(/週|星期/g, '')}</span>
                  <span className="text-[11px] text-gray-300">·</span>
                  <span className="text-[11px] text-gray-400">{g.matches.length} 場</span>
                  <div className="flex-1 border-t border-gray-100" />
                </div>

                {cards.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    {cards.map((m) => (
                      <MatchCard key={m.id} m={m} />
                    ))}
                  </div>
                )}
                {rows.length > 0 && (
                  <div className="divide-y divide-gray-50 rounded-lg border border-gray-100 bg-white">
                    {rows.map((m) => (
                      <MatchRow key={m.id} m={m} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
