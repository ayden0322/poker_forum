'use client';

/**
 * 彩券中心 Hub — 正式版（取代 lottery-preview/c）
 *
 * 資料來源：
 * - /lottery/latest API：6 種彩券最新一期、累積金額、無人中獎期數
 * - 前端 LOTTERY_META：球數規則、開獎時間、機率
 * - daily-pick：日期 seed 隨機推薦
 *
 * TODO（後端配合後升級）：
 * - 我的號碼追蹤：需 user_lottery_picks 表 + GET /lottery/my-picks
 * - 號碼頻率儀表板：需 GET /lottery/stats/{type}/frequency
 * - 跨彩種比較表：機率為靜態，金額來自 latest API（已接）
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth';
import { LotteryBall } from './LotteryBall';
import { GameIcon } from './GameIcon';
import { DrawCountdown } from './DrawCountdown';
import { LOTTERY_META, LotteryMeta, getMetaByType, nextDrawTime } from './lottery-meta';
import { getDailyPick, todayKey } from './daily-pick';
import { MyPickModal } from './MyPickModal';

// ===== API 回應 =====
interface LatestItem {
  gameType: string;
  gameName: string;
  period: string;
  drawDate: string;
  numbers: number[];
  specialNum: number[] | null;
  jackpot: string | null;
  drawSchedule: string;
  noWinnerStreak: number;
}

// ===== 合併資料：API + meta =====
interface LotteryGameView {
  meta: LotteryMeta;
  latest: LatestItem | null;
  jackpot: number | null;
  noWinnerStreak: number;
  nextDrawAt: string;
}

// ===== 我的號碼追蹤 API 回應型別 =====
export interface MyPick {
  id: string;
  gameType: string;
  label: string;
  numbers: number[];
  specialNum: number[] | null;
  createdAt: string;
  updatedAt: string;
  lastCheck: {
    period: string;
    drawDate: string;
    drawNumbers: number[];
    drawSpecial: number[] | null;
    matchedNumbers: number[];
    hits: number;
    specialHit: boolean;
    prize: string | null;
  } | null;
}

// ===== Stats API 回應型別 =====
interface StatsResponse {
  data: {
    totalDraws: number;
    requestedRange: number;
    hot: { number: number; count: number }[];
    cold: { number: number; count: number }[];
    longestUnseen: { number: number; daysSinceLast: number | null }[];
  };
}

// 可在儀表板切換的彩種
const FREQ_DASHBOARD_TYPES = ['LOTTO649', 'SUPER_LOTTO', 'DAILY539'] as const;

// ===== Hub 主元件 =====
export function LotteryHub() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // 抓 6 種彩券最新一期
  const { data, isLoading } = useQuery({
    queryKey: ['lottery-latest-hub'],
    queryFn: () => apiFetch<{ data: LatestItem[] }>('/lottery/latest'),
    staleTime: 5 * 60 * 1000,
  });

  // 我的號碼追蹤（僅登入後抓）
  const { data: myPicksData, isLoading: myPicksLoading } = useQuery({
    queryKey: ['lottery-my-picks'],
    queryFn: () => apiFetch<{ data: MyPick[] }>('/lottery/my-picks'),
    enabled: !!user,
    staleTime: 60 * 1000,
  });
  const myPicks: MyPick[] = myPicksData?.data ?? [];

  // 刪除 mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/lottery/my-picks/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lottery-my-picks'] }),
  });

  // 新增號碼組 modal
  const [pickModalOpen, setPickModalOpen] = useState(false);
  const [pickModalDefaultGame, setPickModalDefaultGame] = useState<string>('LOTTO649');

  // 合併 API + meta
  const games: LotteryGameView[] = useMemo(() => {
    return LOTTERY_META.map((meta) => {
      const latest = data?.data.find((d) => d.gameType === meta.type) ?? null;
      return {
        meta,
        latest,
        jackpot: latest?.jackpot ? Number(latest.jackpot) : null,
        noWinnerStreak: latest?.noWinnerStreak ?? 0,
        nextDrawAt: nextDrawTime(meta).toISOString(),
      };
    });
  }, [data]);

  // 累積金額排序
  const sortedGames = useMemo(() => [...games].sort((a, b) => (b.jackpot ?? 0) - (a.jackpot ?? 0)), [games]);

  // 今晚開獎
  const today = new Date();
  const todayDow = today.getDay();
  const todayDraws = games.filter((g) => g.meta.scheduleDays.includes(todayDow));

  // ===== Hero Top 3 輪播 =====
  const top3 = sortedGames.slice(0, 3);
  const [heroIdx, setHeroIdx] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  useEffect(() => {
    if (heroPaused || top3.length === 0) return;
    const id = setInterval(() => setHeroIdx((i) => (i + 1) % top3.length), 5000);
    return () => clearInterval(id);
  }, [heroPaused, top3.length]);
  const featured = top3[heroIdx] ?? top3[0];

  // ===== 我的號碼追蹤分群 tab =====
  const trackerTabs = useMemo(() => {
    const counts = new Map<string, number>();
    myPicks.forEach((s) => counts.set(s.gameType, (counts.get(s.gameType) ?? 0) + 1));
    const tabs: { key: string; label: string; count: number }[] = [{ key: 'all', label: '全部', count: myPicks.length }];
    Array.from(counts.entries()).forEach(([type, count]) => {
      const meta = getMetaByType(type);
      tabs.push({ key: type, label: meta?.shortName ?? type, count });
    });
    return tabs;
  }, [myPicks]);
  const [trackerTab, setTrackerTab] = useState<string>('all');
  const filteredPicks = useMemo(
    () => (trackerTab === 'all' ? myPicks : myPicks.filter((s) => s.gameType === trackerTab)),
    [trackerTab, myPicks],
  );

  // ===== 號碼頻率儀表板：可切換彩種 + 接真實 API =====
  const [freqType, setFreqType] = useState<string>('LOTTO649');
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['lottery-stats-hub', freqType],
    queryFn: () => apiFetch<StatsResponse>(`/lottery/stats?gameType=${freqType}&range=100`),
    staleTime: 10 * 60 * 1000,
  });
  const stats = statsData?.data;
  const hotTop5 = stats?.hot.slice(0, 5) ?? [];
  const unseenTop5 = stats?.longestUnseen.slice(0, 5) ?? [];

  // 今日隨機推薦（跟著儀表板選的彩種走）
  const freqMeta = getMetaByType(freqType) ?? LOTTERY_META.find((m) => m.type === 'LOTTO649')!;
  const dailyPicks = [getDailyPick(freqMeta, 0), getDailyPick(freqMeta, 1)];
  const seedDate = todayKey();

  if (isLoading || !featured) {
    return (
      <div className="max-w-5xl mx-auto py-12 text-center text-gray-400">
        <div className="text-4xl mb-3 animate-pulse">🎰</div>
        載入中...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* ===== 麵包屑 + 標題 ===== */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1 flex-wrap">
        <Link href="/" className="hover:text-blue-600">首頁</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">彩券中心</span>
      </nav>

      {/* ===== Hero — Top 3 輪播 ===== */}
      <div
        className="mb-4 rounded-2xl overflow-hidden border-2 border-amber-300 shadow-lg relative"
        onMouseEnter={() => setHeroPaused(true)}
        onMouseLeave={() => setHeroPaused(false)}
      >
        <div className="grid md:grid-cols-[1.4fr_1fr] gap-0">
          <div
            key={featured.meta.type}
            className="bg-gradient-to-br from-red-600 via-red-500 to-amber-500 text-white p-5 md:p-7 relative overflow-hidden animate-[fadeIn_0.5s_ease]"
          >
            <div className="absolute -right-8 -bottom-8 text-[180px] opacity-10 leading-none pointer-events-none">💰</div>
            <div className="relative">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <GameIcon meta={featured.meta} size={40} />
                <span className="font-bold text-lg">{featured.meta.shortName}</span>
                {featured.noWinnerStreak >= 3 && (
                  <span className="flex items-center gap-1 text-[10px] font-bold bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full tracking-wider">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    連 {featured.noWinnerStreak} 期未中
                  </span>
                )}
              </div>
              <div className="text-xs text-amber-100/90 tracking-widest mb-1">本期累積頭獎</div>
              <div className="font-bold tabular-nums leading-none my-2">
                {featured.jackpot && featured.jackpot >= 100_000_000 ? (
                  <>
                    <span className="text-5xl md:text-7xl">{(featured.jackpot / 100_000_000).toFixed(2)}</span>
                    <span className="text-2xl ml-2 opacity-90">億</span>
                  </>
                ) : featured.jackpot ? (
                  <>
                    <span className="text-5xl md:text-7xl">{(featured.jackpot / 10_000).toFixed(0)}</span>
                    <span className="text-2xl ml-2 opacity-90">萬</span>
                  </>
                ) : (
                  <span className="text-3xl opacity-80">無資料</span>
                )}
              </div>
              {featured.jackpot && (
                <div className="text-xs text-amber-50/80 mb-3">NT$ {featured.jackpot.toLocaleString()}</div>
              )}
              <Link href={featured.meta.href} className="inline-flex items-center gap-1 mt-2 text-xs px-3 py-1.5 bg-white text-red-600 rounded-full font-bold">
                進入 {featured.meta.shortName} 看板 →
              </Link>
            </div>
          </div>
          <div className="bg-gradient-to-br from-stone-900 to-stone-800 text-white p-5 md:p-7 flex flex-col justify-between">
            <DrawCountdown key={`cd-${featured.meta.type}`} targetIso={featured.nextDrawAt} label="距離下一場開獎" size="md" />
            <div className="mt-4 pt-3 border-t border-white/10">
              <div className="text-[10px] text-amber-300 tracking-widest mb-2">📅 今晚開獎</div>
              <div className="flex flex-wrap gap-1.5">
                {todayDraws.length === 0 ? (
                  <span className="text-xs text-stone-400">今晚無開獎</span>
                ) : (
                  todayDraws.map((g) => (
                    <span key={g.meta.type} className="inline-flex items-center gap-1 text-xs bg-white/10 px-2 py-1 rounded-full">
                      <GameIcon meta={g.meta} size={18} />
                      <span>{g.meta.shortName}</span>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
        {/* 輪播指示點 */}
        <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
          {heroPaused && (
            <span className="text-[9px] text-white/80 font-bold tracking-wider bg-black/30 px-1.5 py-0.5 rounded backdrop-blur-sm">
              ⏸ 已暫停
            </span>
          )}
          <div className="flex items-center gap-1.5">
            {top3.map((g, i) => (
              <button
                key={g.meta.type}
                onClick={() => setHeroIdx(i)}
                aria-label={`切換至 ${g.meta.shortName}`}
                className={`group relative h-1.5 transition-all rounded-full ${
                  i === heroIdx ? 'w-8 bg-white' : 'w-3 bg-white/40 hover:bg-white/70'
                }`}
              >
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-white opacity-0 group-hover:opacity-100 whitespace-nowrap bg-black/40 px-1.5 py-0.5 rounded">
                  {g.meta.shortName}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== 工具捷徑 ===== */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-2">
        <Link href="/lottery/stats" className="flex items-center gap-2 px-4 py-3 rounded-lg border bg-blue-50 text-blue-700 border-blue-200 hover:shadow-md transition-all">
          <span className="text-xl">📊</span>
          <span className="font-bold text-sm">號碼統計</span>
        </Link>
        <Link href="/lottery/check" className="flex items-center gap-2 px-4 py-3 rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-200 hover:shadow-md transition-all">
          <span className="text-xl">🎫</span>
          <span className="font-bold text-sm">線上對獎</span>
        </Link>
        <a className="flex items-center gap-2 px-4 py-3 rounded-lg border bg-purple-50 text-purple-700 border-purple-200 hover:shadow-md cursor-pointer transition-all">
          <span className="text-xl">🔍</span>
          <span className="font-bold text-sm">期數搜尋</span>
        </a>
        <a className="flex items-center gap-2 px-4 py-3 rounded-lg border bg-amber-50 text-amber-700 border-amber-200 hover:shadow-md cursor-pointer transition-all">
          <span className="text-xl">⭐</span>
          <span className="font-bold text-sm">我的號碼</span>
        </a>
      </div>

      {/* ===== 我的號碼追蹤（真實 API） ===== */}
      <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50/30 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⭐</span>
            <span className="font-bold text-sm">我的號碼追蹤</span>
            {user && <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">{myPicks.length} 組</span>}
          </div>
          {user && (
            <button
              onClick={() => {
                setPickModalDefaultGame('LOTTO649');
                setPickModalOpen(true);
              }}
              className="text-xs px-2 py-1 bg-white/15 hover:bg-white/25 rounded-full border border-white/30"
            >
              + 新增號碼組
            </button>
          )}
        </div>

        {/* 未登入提示 */}
        {!user ? (
          <div className="px-6 py-8 text-center bg-white">
            <div className="text-4xl mb-3">🔐</div>
            <div className="text-sm font-semibold text-gray-800 mb-1">登入以追蹤你的幸運號碼</div>
            <div className="text-xs text-gray-500 mb-4">
              收藏自選號碼組，開獎後自動比對顯示中獎結果
            </div>
            <Link
              href="/login"
              className="inline-flex items-center gap-1 px-4 py-2 bg-amber-500 text-white rounded-full text-xs font-bold hover:bg-amber-600 transition-colors"
            >
              立即登入 →
            </Link>
          </div>
        ) : myPicksLoading ? (
          <div className="px-4 py-6 text-center text-xs text-amber-600">載入中...</div>
        ) : myPicks.length === 0 ? (
          <div className="px-6 py-8 text-center bg-white">
            <div className="text-4xl mb-3">🎯</div>
            <div className="text-sm font-semibold text-gray-800 mb-1">還沒收藏任何號碼組</div>
            <div className="text-xs text-gray-500 mb-4">
              建立你的第一組幸運號碼，每期開獎後自動對獎
            </div>
            <button
              onClick={() => {
                setPickModalDefaultGame('LOTTO649');
                setPickModalOpen(true);
              }}
              className="inline-flex items-center gap-1 px-4 py-2 bg-amber-500 text-white rounded-full text-xs font-bold hover:bg-amber-600 transition-colors"
            >
              ⭐ 新增號碼組
            </button>
          </div>
        ) : (
          <>
            {/* 分群 tab */}
            <div className="px-3 py-2 border-b border-amber-200 bg-amber-50/60 flex items-center gap-1 overflow-x-auto">
              {trackerTabs.map((tab) => {
                const meta = tab.key === 'all' ? null : getMetaByType(tab.key);
                const isActive = trackerTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setTrackerTab(tab.key)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      isActive ? 'bg-amber-600 text-white' : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    {meta && <GameIcon meta={meta} size={14} />}
                    <span>{tab.label}</span>
                    <span className={`text-[10px] tabular-nums ${isActive ? 'text-amber-100' : 'text-amber-500'}`}>
                      ({tab.count})
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="divide-y divide-amber-100">
              {filteredPicks.map((set) => {
                const meta = getMetaByType(set.gameType);
                const lc = set.lastCheck;
                const won = !!lc?.prize;
                return (
                  <div key={set.id} className="group flex items-center justify-between gap-3 px-4 py-3 hover:bg-white transition-colors">
                    <div className="flex items-center gap-3 min-w-0 w-40">
                      {meta && <GameIcon meta={meta} size={32} />}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{set.label}</div>
                        <div className="text-[10px] text-gray-500">{meta?.shortName}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 flex-1 justify-center">
                      {set.numbers.map((n) => {
                        const matched = lc?.matchedNumbers.includes(n);
                        return (
                          <span key={n} className={`relative inline-flex ${matched ? 'ring-2 ring-emerald-500 rounded-full' : ''}`}>
                            <LotteryBall number={n} size="sm" />
                          </span>
                        );
                      })}
                      {set.specialNum?.map((n) => {
                        const matched = lc?.specialHit;
                        return (
                          <span key={`s-${n}`} className={`relative inline-flex ${matched ? 'ring-2 ring-emerald-500 rounded-full' : ''}`}>
                            <LotteryBall number={n} size="sm" isSpecial />
                          </span>
                        );
                      })}
                    </div>
                    <div className="text-right shrink-0 w-32">
                      {lc ? (
                        won ? (
                          <>
                            <div className="text-xs font-bold text-emerald-600">🎉 {lc.prize}</div>
                            <div className="text-[10px] text-gray-400">第 {lc.period.slice(-4)} 期</div>
                          </>
                        ) : (
                          <>
                            <div className="text-xs font-bold text-gray-700">
                              中 {lc.hits} 顆{lc.specialHit && '+特'}
                            </div>
                            <div className="text-[10px] text-gray-400">第 {lc.period.slice(-4)} 期</div>
                          </>
                        )
                      ) : (
                        <div className="text-[10px] text-gray-400">尚無對獎</div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(`確定要刪除「${set.label}」這組號碼？`)) {
                          deleteMutation.mutate(set.id);
                        }
                      }}
                      className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="刪除"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-2 bg-amber-50/60 border-t border-amber-100 text-[10px] text-amber-700 text-center">
              💡 開獎後自動比對你的號碼，已中號碼會用綠框標示
            </div>
          </>
        )}
      </div>

      {/* ===== 號碼頻率儀表板 + 今日推薦（接真實 stats API） ===== */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">📈</span>
            <span className="font-bold text-sm text-gray-800">號碼頻率儀表板</span>
            <span className="text-[10px] text-gray-400">最近 {stats?.totalDraws ?? 100} 期</span>
          </div>
          {/* 彩種切換 */}
          <div className="flex items-center gap-1">
            {FREQ_DASHBOARD_TYPES.map((t) => {
              const meta = getMetaByType(t);
              const active = t === freqType;
              return (
                <button
                  key={t}
                  onClick={() => setFreqType(t)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {meta && <GameIcon meta={meta} size={14} />}
                  <span>{meta?.shortName}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-200">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-red-600 tracking-widest">🔥 熱門 TOP 5</span>
              <span className="text-[10px] text-gray-400">出現次數</span>
            </div>
            <div className="space-y-2">
              {statsLoading ? (
                <div className="text-xs text-gray-400 text-center py-4">載入中...</div>
              ) : hotTop5.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-4">尚無資料</div>
              ) : (
                hotTop5.map((t, idx) => {
                  const maxFreq = hotTop5[0]?.count ?? 1;
                  const pct = (t.count / maxFreq) * 100;
                  return (
                    <div key={t.number} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 w-3 tabular-nums">{idx + 1}</span>
                      <LotteryBall number={t.number} size="sm" />
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-red-400 to-red-600" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-gray-600 w-8 text-right">×{t.count}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-blue-600 tracking-widest">❄️ 久未中 TOP 5</span>
              <span className="text-[10px] text-gray-400">未中天數</span>
            </div>
            <div className="space-y-2">
              {statsLoading ? (
                <div className="text-xs text-gray-400 text-center py-4">載入中...</div>
              ) : unseenTop5.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-4">尚無資料</div>
              ) : (
                unseenTop5.map((c, idx) => {
                  const maxDays = unseenTop5[0]?.daysSinceLast ?? 1;
                  const pct = ((c.daysSinceLast ?? 0) / (maxDays || 1)) * 100;
                  return (
                    <div key={c.number} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 w-3 tabular-nums">{idx + 1}</span>
                      <LotteryBall number={c.number} size="sm" />
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-gray-600 w-10 text-right">
                        {c.daysSinceLast ?? '—'}d
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-amber-700 tracking-widest">🎲 今日隨機推薦</span>
              <span className="text-[10px] text-amber-600 tabular-nums">{seedDate}</span>
            </div>
            <div className="space-y-3">
              {dailyPicks.map((pick) => (
                <div key={pick.label}>
                  <div className="text-[10px] text-gray-500 mb-1">{pick.label}</div>
                  <div className="flex flex-wrap gap-1">
                    {pick.numbers.map((n) => (
                      <LotteryBall key={n} number={n} size="sm" />
                    ))}
                    {pick.specialNum?.map((n) => (
                      <LotteryBall key={`s-${n}`} number={n} size="sm" isSpecial />
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={() => {
                  if (!user) {
                    alert('請先登入才能收藏號碼組');
                    return;
                  }
                  setPickModalDefaultGame(freqType);
                  setPickModalOpen(true);
                }}
                className="w-full text-[10px] py-1.5 bg-amber-600 text-white rounded font-bold hover:bg-amber-700"
              >
                ⭐ 加入我的號碼組
              </button>
            </div>
            <div className="mt-2 pt-2 border-t border-amber-200/60 text-[9px] text-amber-700/80 text-center leading-relaxed">
              每日 00:00 自動更新 · 全站使用者相同<br />
              <span className="text-amber-500">僅供娛樂參考，彩券為真隨機</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 跨彩種比較表 ===== */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚖️</span>
            <span className="font-bold text-sm text-gray-800">今晚買哪個 — 跨彩種比較</span>
          </div>
          <span className="text-[10px] text-gray-400">按累積金額排序</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-100 text-[10px] tracking-widest">
                <th className="text-left py-2 px-3 font-medium">彩種</th>
                <th className="text-right py-2 px-3 font-medium">累積頭獎</th>
                <th className="text-right py-2 px-3 font-medium">注金</th>
                <th className="text-right py-2 px-3 font-medium">頭獎機率</th>
                <th className="text-left py-2 px-3 font-medium">推薦度</th>
              </tr>
            </thead>
            <tbody>
              {sortedGames.slice(0, 4).map((g) => {
                const isHot = g.noWinnerStreak >= 3;
                const expectedLabel = isHot
                  ? `🔥 高（累積 ${g.noWinnerStreak} 期）`
                  : g.noWinnerStreak > 0
                  ? `中（累積 ${g.noWinnerStreak} 期）`
                  : '一般';
                return (
                  <tr key={g.meta.type} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="py-2.5 px-3">
                      <span className="flex items-center gap-1.5">
                        <GameIcon meta={g.meta} size={28} />
                        <span className="font-bold text-gray-800">{g.meta.shortName}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      <span className={`font-bold ${isHot ? 'text-red-600' : 'text-gray-700'}`}>
                        {g.jackpot
                          ? g.jackpot >= 100_000_000
                            ? `${(g.jackpot / 100_000_000).toFixed(2)} 億`
                            : `${(g.jackpot / 10_000).toFixed(0)} 萬`
                          : '—'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-gray-600">{g.meta.ticketPrice} 元</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-gray-500">{g.meta.oddsTopPrize}</td>
                    <td className="py-2.5 px-3 text-gray-700">{expectedLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-amber-50/60 border-t border-amber-100 text-[10px] text-amber-800 text-center">
          ⚠️ 期望值僅供參考，理性購彩量力而為
        </div>
      </div>

      {/* ===== 各彩種看板入口 ===== */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-base text-gray-800 flex items-center gap-2">
            <span>🎰</span>
            <span>各彩種看板</span>
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {sortedGames.map((g) => (
            <Link
              key={g.meta.type}
              href={g.meta.href}
              className="block rounded-lg bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all p-3 text-center"
            >
              <div className="flex justify-center mb-1">
                <GameIcon meta={g.meta} size={64} />
              </div>
              <div className="font-bold text-xs text-gray-800">{g.meta.shortName}</div>
              <div className="text-[10px] text-amber-600 font-bold tabular-nums mt-1">
                {g.jackpot
                  ? g.jackpot >= 100_000_000
                    ? `${(g.jackpot / 100_000_000).toFixed(1)}億`
                    : `${(g.jackpot / 10_000).toFixed(0)}萬`
                  : '—'}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ===== 新增號碼組 Modal ===== */}
      {pickModalOpen && (
        <MyPickModal
          defaultGameType={pickModalDefaultGame}
          onClose={() => setPickModalOpen(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['lottery-my-picks'] })}
        />
      )}
    </div>
  );
}
