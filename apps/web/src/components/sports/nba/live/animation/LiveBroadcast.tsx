'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { AnimationOrchestrator } from './AnimationOrchestrator';
import { ToastStack, type ToastMessage } from './ToastStack';
import { EventCard, type EventCardData } from './EventCard';
import { EventBurst, type BurstMessage } from './EventBurst';
import {
  COURT_W,
  COURT_H,
  COURT_CX,
  LEFT_HOOP_X,
  RIGHT_HOOP_X,
  HOOP_Y,
} from './court-coords';
import { isShotEvent } from './events';
import type {
  NBALiveAction,
  NBALivePlayer,
  NBALiveTeam,
} from '../types';

interface Props {
  awayTeam: NBALiveTeam | null;
  homeTeam: NBALiveTeam | null;
  awayPlayers: NBALivePlayer[];
  homePlayers: NBALivePlayer[];
  actions: NBALiveAction[];
  /** 當前持球方 teamId（從後端 linescore.offenseTeamId） */
  offenseTeamId?: number;
}

const KEY_WIDTH = 160;
const KEY_LENGTH = 190;
const THREE_RADIUS = 237.5;

/**
 * NBA 動畫直播主畫面（極簡字卡版）
 *
 * 設計重大轉向（2026-06-01 Ayden 決定）：
 * 從「5v5 dock + 球員動畫」改成「事件字卡聚焦」：
 * - 不再呈現所有球員位置
 * - 投籃/罰球事件 → 中央彈出字卡（球員頭像 + 姓名 + 動作 + 加分）
 * - 籃框震動 / 進球大字 / Toast / Banner 全部保留
 *
 * 視覺核心：
 * 1. 球場 SVG 底圖（背景感、漸層 + 聚光、籃框、中線）
 * 2. 事件字卡（球場中央 HTML overlay）— 主視覺
 * 3. 籃框震動 + 粒子（進球 feedback）
 * 4. Toast（火鍋/抄截/犯規/換人）
 * 5. Banner（節結束/暫停/比賽結束）
 */
export function LiveBroadcast({
  awayTeam,
  homeTeam,
  awayPlayers,
  homePlayers,
  actions,
  offenseTeamId,
}: Props) {
  const awayOnCourt = awayPlayers.filter((p) => p.oncourt);
  const homeOnCourt = homePlayers.filter((p) => p.oncourt);

  // Toast 堆疊（給火鍋/抄截/犯規/換人 等事件用）
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const pushToast = useCallback((t: ToastMessage) => {
    setToasts((arr) => {
      if (arr.some((x) => x.id === t.id)) return arr;
      return [...arr.slice(-4), t];
    });
    const existing = toastTimersRef.current.get(t.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      setToasts((arr) => arr.filter((x) => x.id !== t.id));
      toastTimersRef.current.delete(t.id);
    }, 4000);
    toastTimersRef.current.set(t.id, timer);
  }, []);

  // 事件字卡（投籃 / 罰球時跳出）
  const [eventCard, setEventCard] = useState<EventCardData | null>(null);
  const cardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showEventCard = useCallback((card: EventCardData) => {
    setEventCard(card);
    if (cardTimerRef.current) clearTimeout(cardTimerRef.current);
    cardTimerRef.current = setTimeout(
      () => {
        setEventCard((curr) => (curr?.id === card.id ? null : curr));
      },
      card.made ? 2500 : 1800,
    );
  }, []);

  // 事件特效大字（STEAL / BLOCKED / TURNOVER / OUT / FOUL）
  const [burst, setBurst] = useState<BurstMessage | null>(null);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBurst = useCallback((b: BurstMessage) => {
    setBurst(b);
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    burstTimerRef.current = setTimeout(() => {
      setBurst((curr) => (curr?.id === b.id ? null : curr));
    }, 1500);
  }, []);

  // 判斷哪一邊持球（用於球場頂端持球指示器）
  const awayHasBall = offenseTeamId === awayTeam?.teamId;
  const homeHasBall = offenseTeamId === homeTeam?.teamId;

  // Demo 模式
  const [demoCounter, setDemoCounter] = useState(0);
  const [demoActionType, setDemoActionType] = useState<string>('shot');

  const demoTemplate = useMemo(() => {
    const reversed = [...actions].reverse();
    if (demoActionType === 'shot') {
      return (
        reversed.find(
          (a) =>
            (a.actionType === '2pt' || a.actionType === '3pt') &&
            a.shotResult === 'Made',
        ) ??
        reversed.find((a) => isShotEvent(a) && a.shotResult === 'Made') ??
        reversed.find((a) => isShotEvent(a))
      );
    }
    return reversed.find((a) => a.actionType === demoActionType);
  }, [actions, demoActionType]);

  const effectiveActions = useMemo(() => {
    if (demoCounter === 0) return actions;
    if (!demoTemplate) return actions;

    const maxNum = actions.length
      ? Math.max(...actions.map((a) => a.actionNumber))
      : 0;
    const fakeAction: NBALiveAction = {
      ...demoTemplate,
      actionNumber: maxNum + demoCounter,
    };
    return [...actions, fakeAction];
  }, [actions, demoCounter, demoTemplate]);

  const demoButtons: { label: string; type: string }[] = [
    { label: '投籃 +2/+3', type: 'shot' },
    { label: '罰球', type: 'freethrow' },
    { label: '籃板', type: 'rebound' },
    { label: '火鍋', type: 'block' },
    { label: '抄截', type: 'steal' },
    { label: '失誤', type: 'turnover' },
    { label: '犯規', type: 'foul' },
    { label: '節結束', type: 'period' },
  ];

  const availableDemoTypes = useMemo(() => {
    const types = new Set(actions.map((a) => a.actionType));
    if (
      actions.some((a) => isShotEvent(a) && a.actionType !== 'freethrow')
    ) {
      types.add('shot');
    }
    return types;
  }, [actions]);

  return (
    <div className="relative bg-gradient-to-b from-amber-50 to-amber-100 rounded-xl border border-amber-200 p-3 shadow-sm">
      <div className="text-xs text-gray-600 font-medium mb-2 flex items-center justify-between gap-2 flex-wrap">
        <span className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          動畫直播
        </span>
        <span className="text-[10px] text-gray-400">事件字卡呈現</span>
      </div>

      {/* Demo 按鈕列 */}
      {demoButtons.some((b) => availableDemoTypes.has(b.type)) && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="text-[10px] text-gray-500 font-medium">▶ 試播</span>
          {demoButtons
            .filter((b) => availableDemoTypes.has(b.type))
            .map((b) => (
              <button
                key={b.type}
                type="button"
                onClick={() => {
                  setDemoActionType(b.type);
                  setDemoCounter((c) => c + 1);
                }}
                className="text-[10px] bg-amber-500 hover:bg-amber-600 text-white font-bold px-2 py-0.5 rounded-full transition-colors"
              >
                {b.label}
              </button>
            ))}
        </div>
      )}

      {/* 主畫面：球場 SVG + EventCard / EventBurst / Toast / Banner overlay */}
      <div className="relative">
        {/* Toast 堆疊（右上） */}
        <ToastStack toasts={toasts} />

        {/* Event 字卡（球場中央，投籃 / 罰球） */}
        <EventCard card={eventCard} />

        {/* Event 特效大字（STEAL / BLOCKED / TURNOVER / OUT / FOUL） */}
        <EventBurst burst={burst} />

        <svg
          viewBox={`0 0 ${COURT_W} ${COURT_H}`}
          className="w-full h-auto"
          style={{ maxHeight: 400 }}
        >
          <defs>
            <linearGradient id="courtWood" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#e8c890" />
              <stop offset="50%" stopColor="#f5e1b8" />
              <stop offset="100%" stopColor="#d4a76a" />
            </linearGradient>
            <linearGradient id="keyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fef9c7" />
              <stop offset="100%" stopColor="#fbe79a" />
            </linearGradient>
            <radialGradient id="hoopMetal" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="60%" stopColor="#ea580c" />
              <stop offset="100%" stopColor="#9a3412" />
            </radialGradient>
            <radialGradient id="courtSpotlight" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* 球場底色 */}
          <rect x="0" y="0" width={COURT_W} height={COURT_H} fill="url(#courtWood)" />
          <ellipse
            cx={COURT_CX}
            cy={COURT_H / 2}
            rx={COURT_W * 0.45}
            ry={COURT_H * 0.45}
            fill="url(#courtSpotlight)"
            pointerEvents="none"
          />

          {/* 邊線 */}
          <rect
            x="2"
            y="2"
            width={COURT_W - 4}
            height={COURT_H - 4}
            fill="none"
            stroke="#5a4a2a"
            strokeWidth="2"
          />

          {/* 中線 + 中圈 */}
          <line
            x1={COURT_CX}
            y1="2"
            x2={COURT_CX}
            y2={COURT_H - 2}
            stroke="#5a4a2a"
            strokeWidth="1.5"
          />
          <circle
            cx={COURT_CX}
            cy={HOOP_Y}
            r="60"
            fill="none"
            stroke="#5a4a2a"
            strokeWidth="1.5"
          />
          <circle
            cx={COURT_CX}
            cy={HOOP_Y}
            r="22"
            fill="none"
            stroke="#5a4a2a"
            strokeWidth="1"
          />

          {/* 左右半場 */}
          <CourtHalf side="left" />
          <CourtHalf side="right" />

          {/* 隊伍標籤 + 持球方指示器（球場頂部）
              持球方：隊名變色 + 紅色 dot 脈衝（球賽 idle 時的視覺核心） */}
          <g>
            {/* 客隊 */}
            <g opacity={awayHasBall ? 1 : 0.4}>
              {awayHasBall && (
                <circle cx={COURT_CX - 320} cy={26} r={6} fill="#dc2626">
                  <animate
                    attributeName="opacity"
                    values="1;0.3;1"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <text
                x={COURT_CX - 250}
                y={30}
                textAnchor="middle"
                fontSize="14"
                fontWeight="bold"
                fill={awayHasBall ? '#dc2626' : '#5a4a2a'}
              >
                ← {awayTeam?.shortName ?? '客隊'}
                {awayHasBall ? ' 持球' : ' 進攻'}
              </text>
            </g>
            {/* 主隊 */}
            <g opacity={homeHasBall ? 1 : 0.4}>
              <text
                x={COURT_CX + 250}
                y={30}
                textAnchor="middle"
                fontSize="14"
                fontWeight="bold"
                fill={homeHasBall ? '#2563eb' : '#5a4a2a'}
              >
                {homeTeam?.shortName ?? '主隊'}
                {homeHasBall ? ' 持球' : ' 進攻'} →
              </text>
              {homeHasBall && (
                <circle cx={COURT_CX + 320} cy={26} r={6} fill="#2563eb">
                  <animate
                    attributeName="opacity"
                    values="1;0.3;1"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
            </g>
          </g>

          {/* 動畫協調器：籃框震動 + 進球大字 + 球軌跡 + banner */}
          <AnimationOrchestrator
            awayTeam={awayTeam}
            homeTeam={homeTeam}
            awayOnCourt={awayOnCourt}
            homeOnCourt={homeOnCourt}
            actions={effectiveActions}
            onToast={pushToast}
            onEventCard={showEventCard}
            onEventBurst={showBurst}
          />
        </svg>
      </div>

      <div className="mt-1 text-center text-[10px] text-gray-400">
        投籃事件以字卡呈現 · 其他事件以右上 toast 呈現
      </div>
    </div>
  );
}

/**
 * 半場線條：罰球線禁區 + 罰球圓圈 + 三分線 + 籃板 + 籃框 + no-charge 弧
 */
function CourtHalf({ side }: { side: 'left' | 'right' }) {
  const hoopX = side === 'left' ? LEFT_HOOP_X : RIGHT_HOOP_X;
  const dir = side === 'left' ? 1 : -1;
  const baseLineX = side === 'left' ? 0 : COURT_W;
  const ftFromBaseLine = (ft: number) => baseLineX + dir * ft;
  const keyOuterX1 = side === 'left' ? 0 : COURT_W - KEY_LENGTH;
  const keyTop = HOOP_Y - KEY_WIDTH / 2;
  const ftLineX = ftFromBaseLine(KEY_LENGTH);
  const threeStraightEndX = ftFromBaseLine(140);

  return (
    <g>
      <rect
        x={keyOuterX1}
        y={keyTop}
        width={KEY_LENGTH}
        height={KEY_WIDTH}
        fill="url(#keyGradient)"
        stroke="#5a4a2a"
        strokeWidth="1.5"
      />
      <circle
        cx={ftLineX}
        cy={HOOP_Y}
        r="60"
        fill="none"
        stroke="#5a4a2a"
        strokeWidth="1.5"
      />
      <line
        x1={baseLineX}
        y1={HOOP_Y - KEY_WIDTH / 2 - 25}
        x2={threeStraightEndX}
        y2={HOOP_Y - KEY_WIDTH / 2 - 25}
        stroke="#5a4a2a"
        strokeWidth="1.5"
      />
      <line
        x1={baseLineX}
        y1={HOOP_Y + KEY_WIDTH / 2 + 25}
        x2={threeStraightEndX}
        y2={HOOP_Y + KEY_WIDTH / 2 + 25}
        stroke="#5a4a2a"
        strokeWidth="1.5"
      />
      <path
        d={
          side === 'left'
            ? `M ${threeStraightEndX} ${HOOP_Y - KEY_WIDTH / 2 - 25} A ${THREE_RADIUS} ${THREE_RADIUS} 0 0 1 ${threeStraightEndX} ${HOOP_Y + KEY_WIDTH / 2 + 25}`
            : `M ${threeStraightEndX} ${HOOP_Y - KEY_WIDTH / 2 - 25} A ${THREE_RADIUS} ${THREE_RADIUS} 0 0 0 ${threeStraightEndX} ${HOOP_Y + KEY_WIDTH / 2 + 25}`
        }
        fill="none"
        stroke="#5a4a2a"
        strokeWidth="1.5"
      />
      <line
        x1={ftFromBaseLine(40)}
        y1={HOOP_Y - 30}
        x2={ftFromBaseLine(40)}
        y2={HOOP_Y + 30}
        stroke="#5a4a2a"
        strokeWidth="2.5"
      />
      <circle
        cx={hoopX}
        cy={HOOP_Y}
        r="10"
        fill="none"
        stroke="url(#hoopMetal)"
        strokeWidth="3"
      />
      <circle
        cx={hoopX}
        cy={HOOP_Y}
        r="7"
        fill="none"
        stroke="#fbbf24"
        strokeWidth="1.2"
        opacity="0.7"
      />
      <path
        d={
          side === 'left'
            ? `M ${hoopX} ${HOOP_Y - 40} A 40 40 0 0 1 ${hoopX} ${HOOP_Y + 40}`
            : `M ${hoopX} ${HOOP_Y - 40} A 40 40 0 0 0 ${hoopX} ${HOOP_Y + 40}`
        }
        fill="none"
        stroke="#5a4a2a"
        strokeWidth="1"
        strokeDasharray="3 2"
      />
    </g>
  );
}
