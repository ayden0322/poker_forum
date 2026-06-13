'use client';

/**
 * FIFA 世界盃 — 即時賽事動畫板（轉播圖卡式）
 *
 * 資料源：API-Sports football 的 events / statistics（無球員座標，故採「事件字卡聚焦」，
 * 對齊 NBA 動畫板 2026-06-01 的設計轉向）。
 *
 * 動畫內容：
 * - 球場底圖 + 即時分鐘時鐘（進行中脈動）
 * - 比分翻動；進球時中央「GOAL!」爆發字卡（射手/助攻/旗幟）
 * - 0→90'+ 事件時間軸：事件點依分鐘定位、目前分鐘指針移動
 * - 控球 / 射門動量條動態增長
 * - 即時事件流逐筆飛入
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface TeamView {
  nameZh: string;
  flag: string | null;
}
export interface LiveEvent {
  minute: number;
  extra: number | null;
  side: 'home' | 'away' | null;
  type: string;
  detail: string;
  player: string | null;
  assist: string | null;
}
interface Stat {
  type: string;
  home: string | number | null;
  away: string | number | null;
}

interface Props {
  home: TeamView;
  away: TeamView;
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'live' | 'finished';
  liveMinute: number | null;
  events: LiveEvent[];
  statistics: Stat[];
}

const HOME = '#0d9488'; // teal-600
const AWAY = '#6366f1'; // indigo-500

function eventColor(type: string, detail: string): string {
  if (type === 'Goal') return '#14b8a6';
  if (type === 'Card') return detail.includes('Red') ? '#ef4444' : '#f59e0b';
  if (type === 'subst') return '#9ca3af';
  if (type === 'Var') return '#a855f7';
  return '#9ca3af';
}
function eventGlyph(type: string): string {
  if (type === 'Goal') return '⚽';
  if (type === 'Card') return '▮';
  if (type === 'subst') return '⇄';
  if (type === 'Var') return 'V';
  return '•';
}
function eventLabelZh(type: string, detail: string): string {
  if (type === 'Goal') return '進球';
  if (type === 'Card') return detail.includes('Red') ? '紅牌' : '黃牌';
  if (type === 'subst') return '換人';
  if (type === 'Var') return 'VAR';
  return type;
}
function statNum(v: string | number | null): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace('%', '')) || 0;
}

/** 球場底圖 */
function Pitch() {
  return (
    <svg
      viewBox="0 0 300 120"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full opacity-[0.13]"
      aria-hidden
    >
      <rect width="300" height="120" fill="#0f766e" />
      {[...Array(8)].map((_, i) => (
        <rect key={i} x={i * 37.5} width="18.75" height="120" fill="#0d9488" opacity="0.5" />
      ))}
      <g stroke="#fff" strokeWidth="0.8" fill="none">
        <line x1="150" y1="0" x2="150" y2="120" />
        <circle cx="150" cy="60" r="20" />
        <rect x="0" y="30" width="40" height="60" />
        <rect x="260" y="30" width="40" height="60" />
      </g>
    </svg>
  );
}

function AnimatedScore({ score, color }: { score: number; color: string }) {
  return (
    <div className="relative h-14 w-12 overflow-hidden">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={score}
          initial={{ y: -40, opacity: 0, scale: 1.5 }}
          animate={{ y: 0, opacity: 1, scale: 1, color }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          className="absolute inset-0 flex items-center justify-center text-5xl font-black tabular-nums"
        >
          {score}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function MomentumRow({ type, home, away }: { type: string; home: number; away: number }) {
  const total = home + away || 1;
  const hp = (home / total) * 100;
  const ZH: Record<string, string> = {
    'Ball Possession': '控球率',
    'Total Shots': '總射門',
    'Shots on Goal': '射正',
    'Corner Kicks': '角球',
    'Total passes': '總傳球',
  };
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="tabular-nums font-bold text-teal-700">{home}</span>
        <span className="text-gray-400">{ZH[type] ?? type}</span>
        <span className="tabular-nums font-bold text-indigo-600">{away}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-gray-100">
        <motion.div
          className="bg-teal-500"
          initial={{ width: '50%' }}
          animate={{ width: `${hp}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
        <motion.div
          className="bg-indigo-400"
          initial={{ width: '50%' }}
          animate={{ width: `${100 - hp}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
    </div>
  );
}

export function WorldCupLiveBoard({
  home,
  away,
  homeScore,
  awayScore,
  status,
  liveMinute,
  events,
  statistics,
}: Props) {
  const isLive = status === 'live';
  const hs = homeScore ?? 0;
  const as = awayScore ?? 0;
  const minute = liveMinute ?? (status === 'finished' ? 90 : 0);
  const maxMin = Math.max(90, minute, ...events.map((e) => e.minute + (e.extra ?? 0)));

  // 進球爆發字卡：偵測比分變化
  const prevTotal = useRef(hs + as);
  const [goalFlash, setGoalFlash] = useState<LiveEvent | null>(null);
  useEffect(() => {
    if (hs + as > prevTotal.current) {
      const lastGoal = [...events].reverse().find((e) => e.type === 'Goal') ?? null;
      setGoalFlash(lastGoal);
      const t = setTimeout(() => setGoalFlash(null), 4500);
      prevTotal.current = hs + as;
      return () => clearTimeout(t);
    }
    prevTotal.current = hs + as;
  }, [hs, as, events]);

  // 動量條取常見幾項
  const pickStats = ['Ball Possession', 'Total Shots', 'Shots on Goal', 'Corner Kicks'];
  const momentum = pickStats
    .map((t) => statistics.find((s) => s.type === t))
    .filter(Boolean) as Stat[];

  // 事件流（最新在前）
  const feed = [...events].reverse().slice(0, 8);

  return (
    <div className="relative mb-3 overflow-hidden rounded-2xl border border-teal-200 bg-gradient-to-b from-teal-900 to-teal-950 text-white shadow-lg">
      <Pitch />
      <div className="relative p-4 md:p-5">
        {/* 頭列：狀態 + 分鐘時鐘 */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-[0.2em] text-teal-200">即時動畫</span>
          {isLive ? (
            <span className="flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold">
              <motion.span
                className="h-2 w-2 rounded-full bg-white"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              {minute}&apos; 進行中
            </span>
          ) : (
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">完場回顧</span>
          )}
        </div>

        {/* 比分 */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex items-center justify-end gap-2 min-w-0">
            <span className="truncate text-right text-sm font-bold md:text-base">{home.nameZh}</span>
            <span className="text-2xl">{home.flag ?? '⚪'}</span>
          </div>
          <div className="flex items-center gap-1">
            <AnimatedScore score={hs} color="#fff" />
            <span className="text-2xl font-light text-teal-300">:</span>
            <AnimatedScore score={as} color="#fff" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl">{away.flag ?? '⚪'}</span>
            <span className="truncate text-sm font-bold md:text-base">{away.nameZh}</span>
          </div>
        </div>

        {/* 事件時間軸 */}
        <div className="relative mx-1 mt-6 mb-2 h-14">
          {/* 中線 */}
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/25" />
          {/* 0 / 45 / 90 刻度 */}
          {[0, 45, 90].map((mk) => (
            <div
              key={mk}
              className="absolute top-1/2 -translate-y-1/2 text-[8px] text-teal-300/70"
              style={{ left: `${(mk / maxMin) * 100}%` }}
            >
              <span className="absolute -translate-x-1/2 translate-y-2">{mk}&apos;</span>
            </div>
          ))}
          {/* 目前分鐘指針 */}
          {isLive && (
            <motion.div
              className="absolute top-0 bottom-0 w-0.5 bg-red-400/80"
              initial={false}
              animate={{ left: `${Math.min(100, (minute / maxMin) * 100)}%` }}
              transition={{ type: 'tween', duration: 0.6 }}
            />
          )}
          {/* 事件點：home 在上、away 在下 */}
          {events.map((e, i) => {
            const left = Math.min(100, ((e.minute + (e.extra ?? 0)) / maxMin) * 100);
            const isGoal = e.type === 'Goal';
            const up = e.side === 'home';
            return (
              <motion.div
                key={i}
                className="absolute -translate-x-1/2"
                style={{ left: `${left}%`, top: up ? '6%' : '58%' }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: Math.min(i * 0.03, 0.6), type: 'spring', stiffness: 400, damping: 20 }}
                title={`${e.minute}'${e.extra ? `+${e.extra}` : ''} ${eventLabelZh(e.type, e.detail)} ${e.player ?? ''}`}
              >
                <span
                  className="flex items-center justify-center rounded-full text-[9px] font-bold text-white shadow"
                  style={{
                    width: isGoal ? 18 : 12,
                    height: isGoal ? 18 : 12,
                    background: eventColor(e.type, e.detail),
                  }}
                >
                  {isGoal ? eventGlyph(e.type) : ''}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* 動量條 */}
        {momentum.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-2.5 rounded-xl bg-white/95 p-3 sm:grid-cols-2">
            {momentum.map((s) => (
              <MomentumRow key={s.type} type={s.type} home={statNum(s.home)} away={statNum(s.away)} />
            ))}
          </div>
        )}

        {/* 即時事件流 */}
        {feed.length > 0 && (
          <div className="mt-3">
            <div className="mb-1.5 text-[10px] font-bold tracking-wider text-teal-200">事件動態</div>
            <ul className="space-y-1">
              <AnimatePresence initial={false}>
                {feed.map((e) => {
                  const home_ = e.side === 'home';
                  return (
                    <motion.li
                      key={`${e.minute}-${e.extra}-${e.type}-${e.player}`}
                      layout
                      initial={{ opacity: 0, x: home_ ? -24 : 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                      className={`flex items-center gap-2 text-xs ${home_ ? '' : 'flex-row-reverse text-right'}`}
                    >
                      <span className="w-9 flex-shrink-0 tabular-nums text-teal-300/80">
                        {e.minute}&apos;{e.extra ? `+${e.extra}` : ''}
                      </span>
                      <span
                        className="flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold text-white"
                        style={{ background: eventColor(e.type, e.detail) }}
                      >
                        {eventLabelZh(e.type, e.detail)}
                      </span>
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{e.player ?? '—'}</span>
                        {e.type === 'Goal' && e.assist && (
                          <span className="text-teal-300/70"> （助攻 {e.assist}）</span>
                        )}
                      </span>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </div>
        )}
      </div>

      {/* 進球爆發字卡 */}
      <AnimatePresence>
        {goalFlash && (
          <motion.div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-teal-950/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.3, rotate: -8, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14 }}
              className="text-center"
            >
              <div className="text-6xl font-black tracking-tight text-amber-300 drop-shadow-lg md:text-7xl">
                GOAL!
              </div>
              <div className="mt-2 text-3xl">
                {goalFlash.side === 'home' ? home.flag : away.flag}
              </div>
              <div className="mt-1 text-lg font-bold">{goalFlash.player}</div>
              {goalFlash.assist && (
                <div className="text-sm text-teal-200">助攻 {goalFlash.assist}</div>
              )}
              <div className="mt-2 text-xl font-black tabular-nums">
                {hs} : {as}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
