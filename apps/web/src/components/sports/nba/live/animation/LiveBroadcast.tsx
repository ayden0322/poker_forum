'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { AnimationOrchestrator } from './AnimationOrchestrator';
import { ToastStack, type ToastMessage } from './ToastStack';
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
}

const KEY_WIDTH = 160;
const KEY_LENGTH = 190;
const THREE_RADIUS = 237.5;

/**
 * NBA 動畫直播主畫面
 *
 * 包含：
 * - 球場 SVG（複用 CourtChart 同款 1000x500 全場視角）
 * - 球員 5v5 layer
 * - 球 layer + 投籃軌跡動畫
 * - 籃框震動 + 得分大字幕
 *
 * 跟 CourtChart 的差別：CourtChart 是「累積投籃熱點」、這裡是「即時事件動畫」
 */
export function LiveBroadcast({
  awayTeam,
  homeTeam,
  awayPlayers,
  homePlayers,
  actions,
}: Props) {
  const awayOnCourt = awayPlayers.filter((p) => p.oncourt);
  const homeOnCourt = homePlayers.filter((p) => p.oncourt);

  // Toast 堆疊（給火鍋/抄截/犯規/換人 等事件用）
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const pushToast = useCallback((t: ToastMessage) => {
    setToasts((arr) => {
      // 同 id 不重複加
      if (arr.some((x) => x.id === t.id)) return arr;
      // 最多保留 5 個（顯示時 ToastStack 會切到最後 3 個）
      return [...arr.slice(-4), t];
    });
    // 4 秒後自動移除
    const existing = toastTimersRef.current.get(t.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      setToasts((arr) => arr.filter((x) => x.id !== t.id));
      toastTimersRef.current.delete(t.id);
    }, 4000);
    toastTimersRef.current.set(t.id, timer);
  }, []);

  // Demo 模式：注入「假新事件」讓使用者能在已結束比賽看到動畫效果
  // demoCounter 變化代表「按一次 demo 按鈕」
  const [demoCounter, setDemoCounter] = useState(0);
  const [demoActionType, setDemoActionType] = useState<string>('shot');

  // 從歷史 actions 找符合 demoActionType 的範本
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

  // Demo 按鈕資料
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

  // 過濾出實際 actions 內存在的事件類型（沒有就 hide）
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
        <span className="text-[10px] text-gray-400">事件觸發動畫</span>
      </div>

      {/* Demo 按鈕列：手動觸發各種事件動畫，方便預覽效果（含已結束比賽） */}
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

      {/* Toast 浮窗區（球場 SVG 之上） */}
      <div className="relative">
        <ToastStack toasts={toasts} />

      <svg
        viewBox={`0 0 ${COURT_W} ${COURT_H}`}
        className="w-full h-auto"
        style={{ maxHeight: 480 }}
      >
        {/* === 球場底色 === */}
        <rect x="0" y="0" width={COURT_W} height={COURT_H} fill="#f5e1b8" />

        {/* === 邊線 === */}
        <rect
          x="2"
          y="2"
          width={COURT_W - 4}
          height={COURT_H - 4}
          fill="none"
          stroke="#5a4a2a"
          strokeWidth="2"
        />

        {/* === 中線 + 中圈 === */}
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

        {/* === 左半場 === */}
        <CourtHalf side="left" />
        {/* === 右半場 === */}
        <CourtHalf side="right" />

        {/* === 隊伍標籤（在球場頂部，避開動畫區） === */}
        <g opacity="0.5">
          <text
            x={COURT_CX - 250}
            y={28}
            textAnchor="middle"
            fontSize="13"
            fontWeight="bold"
            fill="#5a4a2a"
          >
            ← {awayTeam?.shortName ?? '客隊'} 進攻
          </text>
          <text
            x={COURT_CX + 250}
            y={28}
            textAnchor="middle"
            fontSize="13"
            fontWeight="bold"
            fill="#5a4a2a"
          >
            {homeTeam?.shortName ?? '主隊'} 進攻 →
          </text>
        </g>

        {/* === 動畫協調器（球員 + 球 + 動畫效果） === */}
        <AnimationOrchestrator
          awayTeam={awayTeam}
          homeTeam={homeTeam}
          awayOnCourt={awayOnCourt}
          homeOnCourt={homeOnCourt}
          actions={effectiveActions}
          onToast={pushToast}
        />
      </svg>
      </div>

      <div className="mt-1 text-center text-[10px] text-gray-400">
        球員位置為示意、非真實場上座標 · 球軌跡為視覺特效
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
      {/* 罰球禁區 */}
      <rect
        x={keyOuterX1}
        y={keyTop}
        width={KEY_LENGTH}
        height={KEY_WIDTH}
        fill="#fef3c7"
        stroke="#5a4a2a"
        strokeWidth="1.5"
      />
      {/* 罰球圓圈 */}
      <circle
        cx={ftLineX}
        cy={HOOP_Y}
        r="60"
        fill="none"
        stroke="#5a4a2a"
        strokeWidth="1.5"
      />
      {/* 三分線兩條直線 */}
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
      {/* 三分弧 */}
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
      {/* 籃板 */}
      <line
        x1={ftFromBaseLine(40)}
        y1={HOOP_Y - 30}
        x2={ftFromBaseLine(40)}
        y2={HOOP_Y + 30}
        stroke="#5a4a2a"
        strokeWidth="2.5"
      />
      {/* 籃框 */}
      <circle
        cx={hoopX}
        cy={HOOP_Y}
        r="7.5"
        fill="none"
        stroke="#c2410c"
        strokeWidth="2.5"
      />
      {/* No-charge 弧 */}
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
