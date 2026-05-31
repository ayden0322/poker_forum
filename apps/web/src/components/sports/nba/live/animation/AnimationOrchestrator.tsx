'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { PlayerLayer } from './PlayerLayer';
import { BallLayer } from './BallLayer';
import {
  COURT_W,
  COURT_H,
  COURT_CX,
  COURT_CY,
  getPlayerPosition,
  getHoopPosition,
  parabolaPath,
} from './court-coords';
import { useNewActions, isShotEvent, isScoringEvent } from './events';
import type { NBALiveAction, NBALivePlayer, NBALiveTeam } from '../types';

interface Props {
  awayTeam: NBALiveTeam | null;
  homeTeam: NBALiveTeam | null;
  awayOnCourt: NBALivePlayer[];
  homeOnCourt: NBALivePlayer[];
  actions: NBALiveAction[];
  awayColor?: string;
  homeColor?: string;
}

interface AnimationState {
  /** 球的當前位置 */
  ballPos: { x: number; y: number };
  /** 球是否在飛 */
  ballFlying: boolean;
  /** 高亮的球員 ID 集合 */
  highlightedIds: Set<number>;
  /** 飛行中的 SVG path（拋物線 / 直線） */
  flightPath: string | null;
  /** 進球時的得分大字（"+2"/"+3"），null 不顯示 */
  scoreFlash: { points: number; color: string } | null;
  /** 進球時籃框震動：'left' / 'right' / null */
  hoopShake: 'left' | 'right' | null;
}

/**
 * NBA 動畫直播核心協調器
 *
 * 職責：
 * 1. 監聽 actions 變化（用 useNewActions hook）
 * 2. 對新事件分派對應動畫（目前只實作投籃，MVP-2 加罰球/籃板/...）
 * 3. 控制球的位置 + 拋物線軌跡 + 籃框震動 + 大字顯示
 *
 * MVP-1 範圍：
 * - 投籃命中：球員位置 → 籃框拋物線 + 籃框震動 + 大字「+2/+3」
 * - 投籃未中：球員位置 → 籃板 + 反彈 + 灰色「未進」
 */
export function AnimationOrchestrator({
  awayTeam,
  homeTeam,
  awayOnCourt,
  homeOnCourt,
  actions,
  awayColor = '#dc2626',
  homeColor = '#2563eb',
}: Props) {
  const [state, setState] = useState<AnimationState>({
    ballPos: { x: COURT_CX, y: COURT_CY }, // 球初始位置：中圈
    ballFlying: false,
    highlightedIds: new Set(),
    flightPath: null,
    scoreFlash: null,
    hoopShake: null,
  });

  const timeoutRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  /** 清掉所有排程中的 timeout（避免動畫重疊） */
  const clearTimers = useCallback(() => {
    timeoutRef.current.forEach((t) => clearTimeout(t));
    timeoutRef.current = [];
  }, []);

  /** 排程在 N 毫秒後執行某動作 */
  const schedule = useCallback((fn: () => void, delay: number) => {
    const t = setTimeout(fn, delay);
    timeoutRef.current.push(t);
    return t;
  }, []);

  /** 播放投籃動畫 */
  const playShotAnimation = useCallback(
    (action: NBALiveAction) => {
      if (!action.personId || !action.teamId) return;

      const isHome = action.teamId === homeTeam?.teamId;
      const made = action.shotResult === 'Made';
      // 這球本身的得分（不是球員累計）：3pt=3、2pt=2、freethrow=1
      const points =
        action.actionType === '3pt'
          ? 3
          : action.actionType === 'freethrow'
          ? 1
          : 2;
      const teamColor = isHome ? homeColor : awayColor;

      // 起始位置：投籃者位置（含 x/y 投籃座標）
      const shooterPos = getPlayerPosition(
        action.personId,
        isHome,
        // NBA shot 座標：cdn 給的是「球員視角」座標，shrinkAction 有保留 x/y
        // 但 NBALiveAction type 內目前只有 shotDistance，要從 recentShots 拿
        // ─ 這裡先用站位 fallback（站位夠用，視覺差不會差很多）
        undefined,
      );

      // 終點：籃框
      const hoopPos = getHoopPosition(isHome);

      // 拋物線 path
      const path = parabolaPath(shooterPos, hoopPos);

      clearTimers();

      // 1. 球瞬移到投籃者手上 + 高亮投籃者
      setState((s) => ({
        ...s,
        ballPos: shooterPos,
        ballFlying: false,
        highlightedIds: new Set([action.personId!]),
        flightPath: null,
        scoreFlash: null,
        hoopShake: null,
      }));

      // 2. 100ms 後啟動拋物線飛行（用 SVG <animateMotion>，path 動畫）
      schedule(() => {
        setState((s) => ({
          ...s,
          flightPath: path,
          ballFlying: true,
        }));
      }, 100);

      // 3. 800ms 後動畫到籃框（球落到目標）
      schedule(() => {
        setState((s) => ({
          ...s,
          ballPos: hoopPos,
          ballFlying: false,
          flightPath: null,
        }));

        if (made) {
          // 命中：籃框震動 + 大字
          setState((s) => ({
            ...s,
            scoreFlash: { points, color: teamColor },
            hoopShake: isHome ? 'right' : 'left',
          }));
        }
      }, 900);

      // 4. 1.6s 後清掉大字幕、籃框震動
      schedule(() => {
        setState((s) => ({
          ...s,
          scoreFlash: null,
          hoopShake: null,
        }));
      }, 1800);

      // 5. 2.5s 後清掉高亮（讓下一個事件接手）
      schedule(() => {
        setState((s) => ({
          ...s,
          highlightedIds: new Set(),
        }));
      }, 2500);
    },
    [homeTeam, homeColor, awayColor, clearTimers, schedule],
  );

  /** 主分派器：依 actionType 路由到對應動畫 */
  const handleNewAction = useCallback(
    (action: NBALiveAction) => {
      if (isShotEvent(action)) {
        playShotAnimation(action);
        return;
      }
      // MVP-2 之後接：rebound / block / steal / turnover / foul / substitution / timeout
    },
    [playShotAnimation],
  );

  useNewActions(actions, handleNewAction);

  return (
    <>
      {/* 球員 layer */}
      <PlayerLayer
        awayOnCourt={awayOnCourt}
        homeOnCourt={homeOnCourt}
        awayColor={awayColor}
        homeColor={homeColor}
        highlightedIds={state.highlightedIds}
      />

      {/* 球的飛行路徑（飛行時短暫顯示） */}
      {state.flightPath && (
        <path
          d={state.flightPath}
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
          strokeDasharray="4 3"
          opacity="0.55"
        />
      )}

      {/* 球 layer
          飛行中：用 animateMotion 沿 flightPath 運動
          靜止：BallLayer 自動 spring 到當前位置 */}
      {state.flightPath ? (
        <g>
          {/* 用 SVG animateMotion 沿 path 飛行 */}
          <circle r="11" fill="#f97316" stroke="#9a3412" strokeWidth="1.2">
            <animateMotion dur="0.7s" repeatCount="1" fill="freeze" path={state.flightPath} />
          </circle>
        </g>
      ) : (
        <BallLayer x={state.ballPos.x} y={state.ballPos.y} flying={false} />
      )}

      {/* 籃框震動效果（命中時） */}
      <AnimatePresence>
        {state.hoopShake && (
          <motion.circle
            key="hoop-shake"
            cx={state.hoopShake === 'right' ? COURT_W - 52.5 : 52.5}
            cy={COURT_H / 2}
            r={20}
            fill="none"
            stroke="#fbbf24"
            strokeWidth="3"
            initial={{ scale: 0.5, opacity: 1 }}
            animate={{ scale: 2.2, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          />
        )}
      </AnimatePresence>

      {/* 得分大字（"+2" / "+3"） */}
      <AnimatePresence>
        {state.scoreFlash && (
          <motion.g
            key="score-flash"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1.4 }}
            exit={{ opacity: 0, scale: 1.8 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{ transformBox: 'fill-box', transformOrigin: `${COURT_CX}px ${COURT_CY}px` }}
          >
            <text
              x={COURT_CX}
              y={COURT_CY + 25}
              textAnchor="middle"
              fontSize="60"
              fontWeight="900"
              fill={state.scoreFlash.color}
              stroke="#ffffff"
              strokeWidth="2"
              paintOrder="stroke"
            >
              +{state.scoreFlash.points}
            </text>
          </motion.g>
        )}
      </AnimatePresence>
    </>
  );
}
