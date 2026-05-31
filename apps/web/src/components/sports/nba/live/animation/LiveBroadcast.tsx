'use client';

import { useState, useMemo } from 'react';
import { AnimationOrchestrator } from './AnimationOrchestrator';
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

  // Demo 模式：注入「假新事件」讓使用者能在已結束比賽看到動畫效果
  // demoActions = 原始 actions + demoCounter 個假的最新事件（每次點按鈕 +1）
  const [demoCounter, setDemoCounter] = useState(0);

  // 從歷史 actions 找最近的「進球 2pt/3pt」當 demo 範本（罰球當 fallback）
  const demoTemplate = useMemo(() => {
    const reversed = [...actions].reverse();
    return (
      reversed.find(
        (a) =>
          (a.actionType === '2pt' || a.actionType === '3pt') &&
          a.shotResult === 'Made',
      ) ??
      reversed.find((a) => isShotEvent(a) && a.shotResult === 'Made') ??
      reversed.find((a) => isShotEvent(a))
    );
  }, [actions]);

  const effectiveActions = useMemo(() => {
    if (demoCounter === 0) return actions;
    if (!demoTemplate) return actions;

    // 製造一個 actionNumber 比所有現存還大的「假事件」
    const maxNum = actions.length
      ? Math.max(...actions.map((a) => a.actionNumber))
      : 0;
    const fakeAction: NBALiveAction = {
      ...demoTemplate,
      actionNumber: maxNum + demoCounter,
    };
    return [...actions, fakeAction];
  }, [actions, demoCounter, demoTemplate]);

  return (
    <div className="bg-gradient-to-b from-amber-50 to-amber-100 rounded-xl border border-amber-200 p-3 shadow-sm">
      <div className="text-xs text-gray-600 font-medium mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          動畫直播
        </span>
        <div className="flex items-center gap-3">
          {/* Demo 按鈕：手動觸發投籃動畫，方便在已結束比賽或測試環境驗證效果 */}
          {demoTemplate && (
            <button
              type="button"
              onClick={() => setDemoCounter((c) => c + 1)}
              className="text-[10px] bg-amber-500 hover:bg-amber-600 text-white font-bold px-2 py-0.5 rounded-full transition-colors"
            >
              ▶ 播放投籃動畫
            </button>
          )}
          <span className="text-[10px] text-gray-400">事件觸發動畫</span>
        </div>
      </div>

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
        />
      </svg>

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
