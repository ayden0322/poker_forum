'use client';

/**
 * FIFA 世界盃 — 即時賽事動畫板（轉播圖卡式）
 *
 * 資料源：API-Sports football 的 events / statistics（無球員座標，故採「事件字卡聚焦」）。
 *
 * 臨場感設計（2026-06-18 強化，設計顧問審後）：
 * - idle 也活著：環形分鐘時鐘 + 指針「持續爬行」（兩次資料更新間用前端時間插值）+ 比分微脈動 + 氣勢底光
 * - 真・氣勢：以射正/射門/控球/角球加權算「壓制指數」，中央拔河條 + 領先側發光
 * - 事件爆發：進球＝閃白 + 全板震動 + 該隊色彩帶 + 比分餘輝（不再全遮畫面）；紅牌＝紅色微閃
 * - 終盤緊張：80' 後邊緣滲入紅暈
 */

import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';

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

/** 加權壓制指數：回傳主隊佔比 0~1（射正權重最高）。資料不足回 0.5 */
function dominanceShare(stats: Stat[]): number {
  const get = (t: string): [number, number] => {
    const s = stats.find((x) => x.type === t);
    return s ? [statNum(s.home), statNum(s.away)] : [0, 0];
  };
  const [poH, poA] = get('Ball Possession');
  const [sgH, sgA] = get('Shots on Goal');
  const [tsH, tsA] = get('Total Shots');
  const [coH, coA] = get('Corner Kicks');
  const h = poH * 0.02 + sgH * 3 + tsH * 1 + coH * 0.8;
  const a = poA * 0.02 + sgA * 3 + tsA * 1 + coA * 0.8;
  const tot = h + a;
  return tot > 0 ? h / tot : 0.5;
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

/** 環形分鐘時鐘（0→90'+ 進度環，中央顯示分鐘）*/
function RingClock({ minute, live }: { minute: number; live: boolean }) {
  const R = 17;
  const C = 2 * Math.PI * R;
  const progress = Math.min(minute / 95, 1);
  const off = C * (1 - progress);
  return (
    <span className="relative inline-flex h-11 w-11 items-center justify-center">
      <svg width={44} height={44} viewBox="0 0 44 44" className="-rotate-90">
        <circle cx={22} cy={22} r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={3} />
        <motion.circle
          cx={22}
          cy={22}
          r={R}
          fill="none"
          stroke={minute >= 80 ? '#f87171' : '#5eead4'}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={C}
          animate={{ strokeDashoffset: off }}
          transition={{ type: 'tween', duration: 0.8 }}
        />
      </svg>
      <span className="absolute flex flex-col items-center leading-none">
        <span className="text-[13px] font-black tabular-nums">{Math.floor(minute)}&apos;</span>
        {live && (
          <motion.span
            className="mt-0.5 h-1 w-1 rounded-full bg-red-400"
            animate={{ opacity: [1, 0.2, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        )}
      </span>
    </span>
  );
}

function AnimatedScore({ score, glow }: { score: number; glow: boolean }) {
  return (
    <div className="relative h-14 w-12 overflow-hidden">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={score}
          initial={{ y: -40, opacity: 0, scale: 1.5 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          className="absolute inset-0 flex items-center justify-center text-5xl font-black tabular-nums text-white"
          style={glow ? { textShadow: '0 0 18px rgba(252,211,77,0.9), 0 0 6px rgba(252,211,77,0.8)' } : undefined}
        >
          {score}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** 氣勢壓制（中央拔河條，領先側發光）*/
function MomentumHero({ share, home, away }: { share: number; home: TeamView; away: TeamView }) {
  const pct = Math.round(share * 100);
  const homeLead = share >= 0.5;
  const lead = homeLead ? home : away;
  const diff = Math.abs(pct - 50);
  return (
    <div className="mt-4 rounded-xl bg-white/95 p-3">
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="font-bold text-teal-700">{home.nameZh}</span>
        <span className="text-gray-400">
          氣勢壓制{diff >= 8 && <span className="ml-1 font-bold text-gray-600">· {lead.nameZh}</span>}
        </span>
        <span className="font-bold text-indigo-600">{away.nameZh}</span>
      </div>
      <div className="relative flex h-3 overflow-hidden rounded-full bg-gray-100">
        <motion.div
          className="bg-teal-500"
          initial={{ width: '50%' }}
          animate={{ width: `${pct}%`, boxShadow: homeLead && diff >= 8 ? `0 0 10px ${HOME}` : 'none' }}
          transition={{ type: 'spring', stiffness: 90, damping: 18 }}
        />
        <motion.div
          className="bg-indigo-400"
          initial={{ width: '50%' }}
          animate={{ width: `${100 - pct}%`, boxShadow: !homeLead && diff >= 8 ? `0 0 10px ${AWAY}` : 'none' }}
          transition={{ type: 'spring', stiffness: 90, damping: 18 }}
        />
        {/* 中央基準線 */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-white/70" />
      </div>
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

// 彩帶碎片預生成（固定亂數，避免每次 render 跳動）
const CONFETTI = Array.from({ length: 14 }, (_, i) => ({
  x: (i / 14) * 100 - 50 + ((i * 37) % 11) - 5,
  delay: ((i * 53) % 25) / 100,
  rotate: ((i * 71) % 360) - 180,
  dur: 1.1 + ((i * 29) % 60) / 100,
}));

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
  const apiMinute = liveMinute ?? (status === 'finished' ? 90 : 0);
  const maxMin = Math.max(90, apiMinute, ...events.map((e) => e.minute + (e.extra ?? 0)));

  // 指針/時鐘「持續爬行」：兩次 30 秒資料更新間，用前端時間插值（約 1 真實分鐘 ≈ 1 比賽分鐘）
  const base = useRef({ m: apiMinute, t: Date.now() });
  const [smoothMin, setSmoothMin] = useState(apiMinute);
  useEffect(() => {
    base.current = { m: apiMinute, t: Date.now() };
    setSmoothMin(apiMinute);
  }, [apiMinute]);
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => {
      const elapsed = (Date.now() - base.current.t) / 60000;
      setSmoothMin(Math.min(maxMin, base.current.m + elapsed));
    }, 1000);
    return () => clearInterval(id);
  }, [isLive, maxMin]);
  const shownMin = isLive ? smoothMin : apiMinute;

  // 進球偵測：比分變化 → 字卡 + 閃白 + 震動 + 比分餘輝 + 彩帶
  const prevTotal = useRef(hs + as);
  const [goalFlash, setGoalFlash] = useState<LiveEvent | null>(null);
  const [whiteFlash, setWhiteFlash] = useState(false);
  const [scoreGlow, setScoreGlow] = useState(false);
  const shake = useAnimationControls();
  useEffect(() => {
    if (hs + as > prevTotal.current) {
      const lastGoal = [...events].reverse().find((e) => e.type === 'Goal') ?? null;
      setGoalFlash(lastGoal);
      setWhiteFlash(true);
      setScoreGlow(true);
      shake.start({ x: [0, -6, 6, -5, 5, -3, 3, 0], transition: { duration: 0.55 } });
      const t1 = setTimeout(() => setWhiteFlash(false), 240);
      const t2 = setTimeout(() => setGoalFlash(null), 4500);
      const t3 = setTimeout(() => setScoreGlow(false), 6500);
      prevTotal.current = hs + as;
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
    prevTotal.current = hs + as;
  }, [hs, as, events, shake]);

  // 紅牌微閃：新事件含紅牌
  const prevLen = useRef(events.length);
  const [redFlash, setRedFlash] = useState(false);
  useEffect(() => {
    if (events.length > prevLen.current) {
      const fresh = events.slice(prevLen.current);
      if (fresh.some((e) => e.type === 'Card' && e.detail.includes('Red'))) {
        setRedFlash(true);
        const t = setTimeout(() => setRedFlash(false), 700);
        prevLen.current = events.length;
        return () => clearTimeout(t);
      }
    }
    prevLen.current = events.length;
  }, [events]);

  // 動量條 + 氣勢
  const pickStats = ['Ball Possession', 'Total Shots', 'Shots on Goal', 'Corner Kicks'];
  const momentum = pickStats
    .map((t) => statistics.find((s) => s.type === t))
    .filter(Boolean) as Stat[];
  const share = useMemo(() => dominanceShare(statistics), [statistics]);
  const hasStats = momentum.length > 0;

  // 氣勢底光（領先側）+ 終盤紅暈
  const leadGlow =
    hasStats && Math.abs(share - 0.5) >= 0.08
      ? `inset 0 -40px 60px -30px ${share > 0.5 ? HOME : AWAY}`
      : 'none';
  const lateTension = isLive && shownMin >= 80;

  const feed = [...events].reverse().slice(0, 8);
  const goalColor = goalFlash?.side === 'home' ? HOME : AWAY;

  return (
    <motion.div
      animate={shake}
      className="relative mb-3 overflow-hidden rounded-2xl border border-teal-200 bg-gradient-to-b from-teal-900 to-teal-950 text-white shadow-lg"
      style={{ boxShadow: leadGlow !== 'none' ? `${leadGlow}, 0 10px 15px -3px rgb(0 0 0 / 0.1)` : undefined }}
    >
      <Pitch />

      {/* 終盤紅暈 */}
      {lateTension && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-0"
          style={{ boxShadow: 'inset 0 0 80px -20px rgba(239,68,68,0.55)' }}
          animate={{ opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity }}
          aria-hidden
        />
      )}

      <div className="relative p-4 md:p-5">
        {/* 頭列：狀態 + 環形時鐘 */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-[0.2em] text-teal-200">即時動畫</span>
          {isLive ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-red-300">LIVE</span>
              <RingClock minute={shownMin} live />
            </div>
          ) : (
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">完場回顧</span>
          )}
        </div>

        {/* 比分（live 時整體微脈動，idle 也活著）*/}
        <motion.div
          className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"
          animate={isLive ? { scale: [1, 1.012, 1] } : { scale: 1 }}
          transition={isLive ? { duration: 4, repeat: Infinity, ease: 'easeInOut' } : undefined}
        >
          <div className="flex items-center justify-end gap-2 min-w-0">
            <span className="truncate text-right text-sm font-bold md:text-base">{home.nameZh}</span>
            <span className="text-2xl">{home.flag ?? '⚪'}</span>
          </div>
          <div className="flex items-center gap-1">
            <AnimatedScore score={hs} glow={scoreGlow} />
            <span className="text-2xl font-light text-teal-300">:</span>
            <AnimatedScore score={as} glow={scoreGlow} />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl">{away.flag ?? '⚪'}</span>
            <span className="truncate text-sm font-bold md:text-base">{away.nameZh}</span>
          </div>
        </motion.div>

        {/* 事件時間軸 */}
        <div className="relative mx-1 mt-6 mb-2 h-14">
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/25" />
          {[0, 45, 90].map((mk) => (
            <div
              key={mk}
              className="absolute top-1/2 -translate-y-1/2 text-[8px] text-teal-300/70"
              style={{ left: `${(mk / maxMin) * 100}%` }}
            >
              <span className="absolute -translate-x-1/2 translate-y-2">{mk}&apos;</span>
            </div>
          ))}
          {/* 目前分鐘指針：持續爬行 */}
          {isLive && (
            <motion.div
              className="absolute top-0 bottom-0 z-10 w-0.5 bg-red-400"
              style={{ left: `${Math.min(100, (shownMin / maxMin) * 100)}%`, boxShadow: '0 0 6px rgba(248,113,113,0.9)' }}
            >
              <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-400" />
            </motion.div>
          )}
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

        {/* 氣勢壓制 + 數據對比條 */}
        {hasStats && (
          <>
            <MomentumHero share={share} home={home} away={away} />
            <div className="mt-2.5 grid grid-cols-1 gap-2.5 rounded-xl bg-white/95 p-3 sm:grid-cols-2">
              {momentum.map((s) => (
                <MomentumRow key={s.type} type={s.type} home={statNum(s.home)} away={statNum(s.away)} />
              ))}
            </div>
          </>
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

      {/* 紅牌微閃 */}
      <AnimatePresence>
        {redFlash && (
          <motion.div
            className="pointer-events-none absolute inset-0 z-20 bg-red-600"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.4, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
            aria-hidden
          />
        )}
      </AnimatePresence>

      {/* 進球閃白 */}
      <AnimatePresence>
        {whiteFlash && (
          <motion.div
            className="pointer-events-none absolute inset-0 z-30 bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.65, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 }}
            aria-hidden
          />
        )}
      </AnimatePresence>

      {/* 進球字卡（不全遮，球場/比分仍可見）+ 彩帶 */}
      <AnimatePresence>
        {goalFlash && (
          <motion.div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden bg-teal-950/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* 彩帶（該進球隊色）*/}
            {CONFETTI.map((c, i) => (
              <motion.span
                key={i}
                className="absolute top-0 h-2 w-1.5 rounded-sm"
                style={{ left: `calc(50% + ${c.x}%)`, background: goalColor }}
                initial={{ y: -20, opacity: 0, rotate: 0 }}
                animate={{ y: 180, opacity: [0, 1, 1, 0], rotate: c.rotate }}
                transition={{ duration: c.dur, delay: c.delay, ease: 'easeIn' }}
              />
            ))}
            <motion.div
              initial={{ scale: 0.3, rotate: -8, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 13 }}
              className="relative z-10 text-center"
            >
              <div className="text-6xl font-black tracking-tight text-amber-300 drop-shadow-[0_2px_12px_rgba(252,211,77,0.6)] md:text-7xl">
                GOAL!
              </div>
              <div className="mt-2 text-3xl">{goalFlash.side === 'home' ? home.flag : away.flag}</div>
              <div className="mt-1 text-lg font-bold">{goalFlash.player}</div>
              {goalFlash.assist && <div className="text-sm text-teal-200">助攻 {goalFlash.assist}</div>}
              <div className="mt-2 text-xl font-black tabular-nums">
                {hs} : {as}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
