'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BannerLayer, type BannerMessage } from './BannerLayer';
import type { ToastMessage } from './ToastStack';
import type { EventCardData } from './EventCard';
import { describeShot } from './EventCard';
import type { BurstMessage } from './EventBurst';
import {
  COURT_W,
  COURT_H,
  COURT_CX,
  COURT_CY,
  getHoopPosition,
  getFreeThrowLinePosition,
  parabolaPath,
} from './court-coords';
import { useNewActions, isShotEvent } from './events';
import type { NBALiveAction, NBALivePlayer, NBALiveTeam } from '../types';

const HEADSHOT = (personId: number) =>
  `https://cdn.nba.com/headshots/nba/latest/1040x760/${personId}.png`;

interface Props {
  awayTeam: NBALiveTeam | null;
  homeTeam: NBALiveTeam | null;
  awayOnCourt: NBALivePlayer[];
  homeOnCourt: NBALivePlayer[];
  actions: NBALiveAction[];
  awayColor?: string;
  homeColor?: string;
  onToast?: (toast: ToastMessage) => void;
  onEventCard?: (card: EventCardData) => void;
  onEventBurst?: (burst: BurstMessage) => void;
}

interface AnimationState {
  flightPath: string | null;
  scoreFlash: { points: number; color: string } | null;
  hoopShake: 'left' | 'right' | null;
  banner: BannerMessage | null;
}

/** action 中文化（toast 用） */
const ACTION_LABEL_ZH: Record<string, string> = {
  block: '火鍋',
  steal: '抄截',
  turnover: '失誤',
  foul: '犯規',
  substitution: '換人',
  timeout: '暫停',
  rebound: '籃板',
  jumpball: '跳球',
  violation: '違例',
};

const ACTION_COLOR: Record<string, string> = {
  block: '#a855f7',
  steal: '#22c55e',
  turnover: '#9ca3af',
  foul: '#f97316',
  substitution: '#06b6d4',
  timeout: '#6366f1',
  rebound: '#10b981',
  jumpball: '#0ea5e9',
  violation: '#f59e0b',
};

const ACTION_ICON: Record<string, string> = {
  block: 'B',
  steal: 'S',
  turnover: 'TO',
  foul: 'F',
  substitution: '↔',
  timeout: 'T',
  rebound: 'R',
  jumpball: 'J',
  violation: 'V',
};

/**
 * NBA 動畫直播事件協調器（極簡字卡版）
 *
 * 設計轉向（2026-06-01 Ayden 決定）：
 * 從「5v5 dock + 球員動畫」改成「事件字卡聚焦」。本元件只負責：
 *
 * 1. 投籃 / 罰球事件 → onEventCard(球員頭像 + 中文姓名 + 動作 + 加分)
 *    + 籃框震動 + 進球大字 + 球從中央到籃框拋物線（簡化版）
 * 2. 火鍋/抄截/失誤/犯規/換人/violation/jumpball → onToast 右上浮窗
 * 3. 節結束/暫停/比賽結束 → banner 全螢幕大字幕
 *
 * 砍掉的：球員 dock、pose 動畫、傳球前奏、罰球指示器、球員位置邏輯
 */
export function AnimationOrchestrator({
  homeTeam,
  awayOnCourt,
  homeOnCourt,
  actions,
  awayColor = '#dc2626',
  homeColor = '#2563eb',
  onToast,
  onEventCard,
  onEventBurst,
}: Props) {
  const [state, setState] = useState<AnimationState>({
    flightPath: null,
    scoreFlash: null,
    hoopShake: null,
    banner: null,
  });
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;
  const onEventCardRef = useRef(onEventCard);
  onEventCardRef.current = onEventCard;
  const onEventBurstRef = useRef(onEventBurst);
  onEventBurstRef.current = onEventBurst;

  const timeoutRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timeoutRef.current.forEach((t) => clearTimeout(t));
    timeoutRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, delay: number) => {
    const t = setTimeout(fn, delay);
    timeoutRef.current.push(t);
    return t;
  }, []);

  /** 從 oncourt 球員陣列找該球員的中文名 */
  const findPlayerName = useCallback(
    (personId: number, fallback?: string): string => {
      const allPlayers = [...awayOnCourt, ...homeOnCourt];
      const found = allPlayers.find((p) => p.personId === personId);
      return (
        found?.shortName ??
        found?.nameZhTw ??
        found?.name ??
        fallback ??
        '球員'
      );
    },
    [awayOnCourt, homeOnCourt],
  );

  /** 播放投籃 / 罰球事件動畫（含字卡 + 球軌跡 + 籃框震動 + 大字） */
  const playShotEvent = useCallback(
    (action: NBALiveAction) => {
      if (!action.personId || !action.teamId) return;

      const isHome = action.teamId === homeTeam?.teamId;
      const made = action.shotResult === 'Made';
      const isFreeThrow = action.actionType === 'freethrow';
      const points =
        action.actionType === '3pt' ? 3 : isFreeThrow ? 1 : 2;
      const teamColor = isHome ? homeColor : awayColor;

      // 起始位置：罰球從罰球線、否則從球場中央偏進攻方向
      const shooterPos = isFreeThrow
        ? getFreeThrowLinePosition(isHome)
        : { x: isHome ? COURT_CX + 100 : COURT_CX - 100, y: COURT_CY };

      const hoopPos = getHoopPosition(isHome);
      const endPos = !made && isFreeThrow
        ? { x: hoopPos.x, y: hoopPos.y + 25 }
        : hoopPos;

      const shotPath = parabolaPath(shooterPos, endPos);

      clearTimers();

      // 1. 通知字卡（球員名 + 動作 + 加分）
      const playerName =
        action.playerNameZhTw ??
        action.playerShortName ??
        findPlayerName(action.personId, action.playerName);
      const actionLabel = describeShot(action.actionType, action.subType);

      onEventCardRef.current?.({
        id: action.actionNumber,
        headshotUrl: HEADSHOT(action.personId),
        playerName,
        actionLabel,
        points,
        made,
        teamColor,
        side: isHome ? 'right' : 'left',
      });

      // 2. 100ms 後球開始飛
      schedule(() => {
        setState((s) => ({
          ...s,
          flightPath: shotPath,
        }));
      }, 100);

      // 3. 球到籃框 + 命中視覺反饋
      schedule(() => {
        setState((s) => ({
          ...s,
          flightPath: null,
        }));
        if (made) {
          setState((s) => ({
            ...s,
            scoreFlash: { points, color: teamColor },
            hoopShake: isHome ? 'right' : 'left',
          }));
        }
      }, 900);

      // 4. 清掉大字 + 震動
      schedule(() => {
        setState((s) => ({
          ...s,
          scoreFlash: null,
          hoopShake: null,
        }));
      }, 1800);
    },
    [homeTeam, homeColor, awayColor, clearTimers, schedule, findPlayerName],
  );

  /** 推送 toast（非投籃事件） */
  const pushToast = useCallback((action: NBALiveAction) => {
    if (!onToastRef.current) return;
    const t = action.actionType;
    const label = ACTION_LABEL_ZH[t] ?? t;
    const subtitle =
      (action.playerNameZhTw || action.playerNameI || action.playerName) ??
      undefined;
    onToastRef.current({
      id: action.actionNumber,
      title: subtitle ? `${subtitle} · ${label}` : label,
      subtitle: action.description,
      color: ACTION_COLOR[t] ?? '#6366f1',
      icon: ACTION_ICON[t] ?? '·',
    });
  }, []);

  /** 顯示全螢幕大字幕 */
  const showBanner = useCallback(
    (
      bannerId: string,
      title: string,
      subtitle?: string,
      durationMs = 2000,
      style?: { bgColor?: string; textColor?: string },
    ) => {
      setState((s) => ({
        ...s,
        banner: { id: bannerId, title, subtitle, ...style },
      }));
      schedule(() => {
        setState((s) =>
          s.banner?.id === bannerId ? { ...s, banner: null } : s,
        );
      }, durationMs);
    },
    [schedule],
  );

  const handleNewAction = useCallback(
    (action: NBALiveAction) => {
      // 投籃 / 罰球：字卡 + 球軌跡 + 籃框震動 + 大字
      if (isShotEvent(action)) {
        playShotEvent(action);
        return;
      }
      // 節 / 比賽 / 暫停：banner
      if (action.actionType === 'period') {
        if (action.subType === 'end') {
          showBanner(
            `period-end-${action.actionNumber}`,
            `Q${action.period} END`,
            `第 ${action.period} 節結束`,
          );
        } else if (action.subType === 'start') {
          showBanner(
            `period-start-${action.actionNumber}`,
            `Q${action.period} START`,
            `第 ${action.period} 節開始`,
            1500,
          );
        }
        return;
      }
      if (action.actionType === 'game') {
        if (action.subType === 'end') {
          showBanner(
            `game-end-${action.actionNumber}`,
            'FINAL',
            '比賽結束',
            3000,
            { textColor: '#fbbf24' },
          );
        } else if (action.subType === 'start') {
          showBanner(
            `game-start-${action.actionNumber}`,
            'TIP OFF',
            '比賽開始',
            1800,
          );
        }
        return;
      }
      if (action.actionType === 'timeout') {
        showBanner(
          `timeout-${action.actionNumber}`,
          'TIMEOUT',
          '暫停',
          1500,
        );
        return;
      }
      // 強反饋事件 → EventBurst 中央大字 + toast 雙重呈現
      // 規則：戲劇性事件用 burst（抄截/火鍋/失誤/出界）、其他用 toast
      const burstSpec: Record<string, { text: string; color: string }> = {
        steal: { text: 'STEAL', color: '#16a34a' }, // 綠
        block: { text: 'BLOCKED', color: '#7e22ce' }, // 紫
        turnover: { text: 'TURNOVER', color: '#6b7280' }, // 灰
      };

      const spec = burstSpec[action.actionType];
      if (spec) {
        const subtitle =
          action.playerNameZhTw ?? action.playerNameI ?? action.playerName;
        onEventBurstRef.current?.({
          id: action.actionNumber,
          text: spec.text,
          subtitle,
          color: spec.color,
        });
        pushToast(action); // toast 也保留，給「球場區捲走」的 user 看
        return;
      }

      // violation：依 subType 判斷是否「出界」、其他違例
      if (action.actionType === 'violation') {
        const sub = (action.subType ?? '').toLowerCase();
        const isOutOfBounds = sub.includes('out of bounds') || sub.includes('out-of-bounds');
        const subtitle =
          action.playerNameZhTw ?? action.playerNameI ?? action.playerName;
        onEventBurstRef.current?.({
          id: action.actionNumber,
          text: isOutOfBounds ? 'OUT OF BOUNDS' : 'VIOLATION',
          subtitle: isOutOfBounds ? `${subtitle ?? ''} · 出界` : subtitle,
          color: '#f97316', // 橘
        });
        pushToast(action);
        return;
      }

      // 犯規：burst（橘）+ toast，但 burst 字小一點避免太擾人（demo 連點時）
      if (action.actionType === 'foul') {
        const subtitle =
          action.playerNameZhTw ?? action.playerNameI ?? action.playerName;
        onEventBurstRef.current?.({
          id: action.actionNumber,
          text: 'FOUL',
          subtitle,
          color: '#f97316',
        });
        pushToast(action);
        return;
      }

      // 換人 / 跳球 / 籃板：純 toast 即可（這些不需要大字打斷）
      if (
        action.actionType === 'substitution' ||
        action.actionType === 'jumpball' ||
        action.actionType === 'rebound'
      ) {
        pushToast(action);
        return;
      }
    },
    [playShotEvent, pushToast, showBanner],
  );

  useNewActions(actions, handleNewAction);

  return (
    <>
      {/* 球的飛行路徑（拋物線、虛線） */}
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

      {/* 球沿 path 飛 */}
      {state.flightPath && (
        <circle r="11" fill="#f97316" stroke="#9a3412" strokeWidth="1.2">
          <animateMotion
            dur="0.7s"
            repeatCount="1"
            fill="freeze"
            path={state.flightPath}
          />
        </circle>
      )}

      {/* 籃框震動 + 粒子（命中時） */}
      <AnimatePresence>
        {state.hoopShake && (
          <g key="hoop-shake">
            <motion.circle
              cx={state.hoopShake === 'right' ? COURT_W - 52.5 : 52.5}
              cy={COURT_H / 2}
              r={20}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="3"
              initial={{ scale: 0.5, opacity: 1 }}
              animate={{ scale: 2.4, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
            <motion.circle
              cx={state.hoopShake === 'right' ? COURT_W - 52.5 : 52.5}
              cy={COURT_H / 2}
              r={12}
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              initial={{ scale: 0.5, opacity: 0.9 }}
              animate={{ scale: 1.8, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
            {Array.from({ length: 8 }).map((_, i) => {
              const angle = (i / 8) * Math.PI * 2;
              const cx = state.hoopShake === 'right' ? COURT_W - 52.5 : 52.5;
              const cy = COURT_H / 2;
              const dx = Math.cos(angle) * 35;
              const dy = Math.sin(angle) * 35;
              return (
                <motion.circle
                  key={`particle-${i}`}
                  cx={cx}
                  cy={cy}
                  r={3}
                  fill="#fbbf24"
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{ x: dx, y: dy, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              );
            })}
          </g>
        )}
      </AnimatePresence>

      {/* 得分大字（"+2" / "+3"）— 錨定到進球籃框 */}
      <AnimatePresence>
        {state.scoreFlash && (() => {
          const flashX =
            state.hoopShake === 'right' ? COURT_W - 52.5 : 52.5;
          const flashY = COURT_H / 2 - 60;
          return (
            <motion.g
              key="score-flash"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1.3 }}
              exit={{ opacity: 0, scale: 1.6 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              style={{ transformBox: 'fill-box', transformOrigin: `${flashX}px ${flashY}px` }}
            >
              <text
                x={flashX}
                y={flashY}
                textAnchor="middle"
                fontSize="44"
                fontWeight="900"
                fill={state.scoreFlash.color}
                stroke="#ffffff"
                strokeWidth="2.5"
                paintOrder="stroke"
              >
                +{state.scoreFlash.points}
              </text>
            </motion.g>
          );
        })()}
      </AnimatePresence>

      {/* 全螢幕大字幕 */}
      <BannerLayer banner={state.banner} />
    </>
  );
}
