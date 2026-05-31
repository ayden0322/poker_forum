'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayerLayer } from './PlayerLayer';
import { BallLayer } from './BallLayer';
import { BannerLayer, type BannerMessage } from './BannerLayer';
import type { ToastMessage } from './ToastStack';
import {
  COURT_W,
  COURT_H,
  COURT_CX,
  COURT_CY,
  getPlayerPosition,
  getHoopPosition,
  getFreeThrowLinePosition,
  parabolaPath,
} from './court-coords';
import { useNewActions, isShotEvent } from './events';
import type { NBALiveAction, NBALivePlayer, NBALiveTeam } from '../types';

interface Props {
  awayTeam: NBALiveTeam | null;
  homeTeam: NBALiveTeam | null;
  awayOnCourt: NBALivePlayer[];
  homeOnCourt: NBALivePlayer[];
  actions: NBALiveAction[];
  awayColor?: string;
  homeColor?: string;
  /** 父層 callback：toast 出現時呼叫，由父層 manage stack */
  onToast?: (toast: ToastMessage) => void;
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
  /** 罰球指示器：{ftMade: 第幾罰命中 } */
  freeThrowIndicator: {
    current: number;
    total: number;
    made: boolean;
    pos: { x: number; y: number };
  } | null;
  /** 全螢幕大字幕 */
  banner: BannerMessage | null;
}

/** action 中文化 */
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
  onToast,
}: Props) {
  const [state, setState] = useState<AnimationState>({
    ballPos: { x: COURT_CX, y: COURT_CY }, // 球初始位置：中圈
    ballFlying: false,
    highlightedIds: new Set(),
    flightPath: null,
    scoreFlash: null,
    hoopShake: null,
    freeThrowIndicator: null,
    banner: null,
  });
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;

  /**
   * 「上一個有 actor 的事件」追蹤——用於 Fake B 傳球軌跡：
   * 投籃前若上一事件 actor 跟現在投籃者不同，先畫一段傳球軌跡。
   */
  const lastActorRef = useRef<{ personId: number; teamId: number } | null>(
    null,
  );

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

  /** 解析罰球 subType（"1 of 2" / "2 of 2" / "1 of 3" ... ）→ {current, total} */
  const parseFreeThrowSubType = (
    subType?: string,
  ): { current: number; total: number } | null => {
    if (!subType) return null;
    const m = subType.match(/(\d+)\s*of\s*(\d+)/i);
    if (!m) return null;
    return { current: parseInt(m[1], 10), total: parseInt(m[2], 10) };
  };

  /** 播放投籃動畫（2pt/3pt/freethrow），自動帶傳球前奏 */
  const playShotAnimation = useCallback(
    (action: NBALiveAction) => {
      if (!action.personId || !action.teamId) return;

      const isHome = action.teamId === homeTeam?.teamId;
      const made = action.shotResult === 'Made';
      const isFreeThrow = action.actionType === 'freethrow';
      // 這球本身的得分：3pt=3、2pt=2、freethrow=1
      const points =
        action.actionType === '3pt' ? 3 : isFreeThrow ? 1 : 2;
      const teamColor = isHome ? homeColor : awayColor;

      // 起始位置：罰球從罰球線、否則從球員站位
      const shooterPos = isFreeThrow
        ? getFreeThrowLinePosition(isHome)
        : getPlayerPosition(action.personId, isHome);

      // 終點：籃框（罰球未中時偏離一點）
      const hoopPos = getHoopPosition(isHome);
      const endPos = !made && isFreeThrow
        ? { x: hoopPos.x, y: hoopPos.y + 25 } // 罰球未中：偏籃板下方
        : hoopPos;

      // 拋物線 path
      const shotPath = parabolaPath(shooterPos, endPos);

      // 罰球指示器（顯示 1✓2✗ 之類）
      const ftMeta = isFreeThrow ? parseFreeThrowSubType(action.subType) : null;

      // === Fake B 傳球軌跡邏輯 ===
      // 條件：非罰球 + 上一事件 actor 跟當前 actor 不同（且同隊伍）
      const prevActor = lastActorRef.current;
      const shouldShowPass =
        !isFreeThrow &&
        prevActor &&
        prevActor.personId !== action.personId &&
        prevActor.teamId === action.teamId;

      clearTimers();

      let shotStartDelay = 100;

      if (shouldShowPass) {
        // 傳球階段：球從上一 actor 位置 → 當前投籃者
        const passFromPos = getPlayerPosition(
          prevActor!.personId,
          prevActor!.teamId === homeTeam?.teamId,
        );
        const passPath = parabolaPath(passFromPos, shooterPos, 60);

        // 1a. 球先放在傳球者位置 + 高亮傳球者
        setState((s) => ({
          ...s,
          ballPos: passFromPos,
          ballFlying: false,
          highlightedIds: new Set([prevActor!.personId]),
          flightPath: null,
          scoreFlash: null,
          hoopShake: null,
          freeThrowIndicator: null,
        }));

        // 1b. 100ms 後啟動傳球飛行
        schedule(() => {
          setState((s) => ({
            ...s,
            flightPath: passPath,
            ballFlying: true,
          }));
        }, 100);

        // 1c. 600ms 後球到達投籃者
        schedule(() => {
          setState((s) => ({
            ...s,
            ballPos: shooterPos,
            ballFlying: false,
            flightPath: null,
            highlightedIds: new Set([action.personId!]),
          }));
        }, 700);

        shotStartDelay = 900; // 投籃動畫延後
      } else {
        // 沒有傳球：直接球到投籃者位置
        setState((s) => ({
          ...s,
          ballPos: shooterPos,
          ballFlying: false,
          highlightedIds: new Set([action.personId!]),
          flightPath: null,
          scoreFlash: null,
          hoopShake: null,
          freeThrowIndicator: null,
        }));
      }

      // 2. 投籃拋物線
      schedule(() => {
        setState((s) => ({
          ...s,
          flightPath: shotPath,
          ballFlying: true,
        }));
      }, shotStartDelay);

      // 3. 球落到籃框
      schedule(() => {
        setState((s) => ({
          ...s,
          ballPos: endPos,
          ballFlying: false,
          flightPath: null,
        }));

        if (made) {
          setState((s) => ({
            ...s,
            scoreFlash: { points, color: teamColor },
            hoopShake: isHome ? 'right' : 'left',
          }));
        }

        if (ftMeta) {
          setState((s) => ({
            ...s,
            freeThrowIndicator: {
              current: ftMeta.current,
              total: ftMeta.total,
              made,
              pos: { x: shooterPos.x, y: shooterPos.y - 35 },
            },
          }));
        }
      }, shotStartDelay + 800);

      // 4. 清掉大字幕、籃框震動
      schedule(() => {
        setState((s) => ({
          ...s,
          scoreFlash: null,
          hoopShake: null,
        }));
      }, shotStartDelay + 1700);

      // 5. 清掉高亮、罰球指示器
      schedule(() => {
        setState((s) => ({
          ...s,
          highlightedIds: new Set(),
          freeThrowIndicator: null,
        }));
      }, shotStartDelay + 2400);

    },
    [homeTeam, homeColor, awayColor, clearTimers, schedule],
  );

  /** 播放籃板動畫：球落到籃下 + 籃板球員伸手圖示 */
  const playReboundAnimation = useCallback(
    (action: NBALiveAction) => {
      if (!action.personId || !action.teamId) return;

      const isHome = action.teamId === homeTeam?.teamId;
      // 籃板者通常是「防守籃板」，所以反向找對手的籃框（球從對方籃框附近回彈）
      const isOffensiveRebound = action.subType === 'offensive';
      // 進攻籃板：球員搶到自己進攻的籃框；防守籃板：球員搶到對手進攻的籃框
      const ballHoop = isOffensiveRebound
        ? getHoopPosition(isHome)
        : getHoopPosition(!isHome);
      const playerPos = getPlayerPosition(action.personId, isHome);

      clearTimers();

      // 1. 球從籃下到籃板球員位置
      setState((s) => ({
        ...s,
        ballPos: ballHoop,
        ballFlying: false,
        highlightedIds: new Set([action.personId!]),
        flightPath: null,
        scoreFlash: null,
        hoopShake: null,
        freeThrowIndicator: null,
      }));

      // 2. 200ms 後啟動「球彈跳到球員」動畫（簡單拋物線）
      schedule(() => {
        const path = parabolaPath(ballHoop, playerPos, 50);
        setState((s) => ({
          ...s,
          flightPath: path,
          ballFlying: true,
        }));
      }, 200);

      // 3. 700ms 後球到達球員
      schedule(() => {
        setState((s) => ({
          ...s,
          ballPos: playerPos,
          ballFlying: false,
          flightPath: null,
        }));
      }, 900);

      // 4. 2s 後清掉高亮
      schedule(() => {
        setState((s) => ({
          ...s,
          highlightedIds: new Set(),
        }));
      }, 2000);
    },
    [homeTeam, clearTimers, schedule],
  );

  /** 推送 toast（給非視覺軌跡事件用：火鍋、抄截、犯規...） */
  const pushToast = useCallback((action: NBALiveAction) => {
    if (!onToastRef.current) return;
    const t = action.actionType;
    const label = ACTION_LABEL_ZH[t] ?? t;
    const subtitle =
      (action.playerNameZhTw || action.playerNameI || action.playerName) ?? undefined;
    onToastRef.current({
      id: action.actionNumber,
      title: subtitle ? `${subtitle} · ${label}` : label,
      subtitle: action.description,
      color: ACTION_COLOR[t] ?? '#6366f1',
      icon: ACTION_ICON[t] ?? '·',
    });
  }, []);

  /** 顯示全螢幕大字幕（period / game 事件） */
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

  /** 主分派器：依 actionType 路由到對應動畫 */
  const handleNewAction = useCallback(
    (action: NBALiveAction) => {
      // 更新 lastActor 給下個事件用（傳球軌跡邏輯需要）
      // 不過要在 dispatch 「之前」更新還是「之後」？
      // 答案：之後。因為當前事件的 playShotAnimation 會讀「上一次的 lastActor」
      // 算傳球，跑完再寫回自己。
      const updateLastActor = () => {
        if (action.personId && action.teamId) {
          lastActorRef.current = {
            personId: action.personId,
            teamId: action.teamId,
          };
        }
      };

      // 投籃（含罰球）：拋物線動畫
      if (isShotEvent(action)) {
        playShotAnimation(action);
        updateLastActor();
        return;
      }
      // 籃板：球從籃下到搶板球員
      if (action.actionType === 'rebound') {
        playReboundAnimation(action);
        updateLastActor();
        return;
      }
      // 節結束 / 比賽結束：大字幕
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
      // 暫停：大字幕（短）
      if (action.actionType === 'timeout') {
        showBanner(
          `timeout-${action.actionNumber}`,
          'TIMEOUT',
          '暫停',
          1500,
        );
        return;
      }
      // 火鍋 / 抄截 / 失誤 / 犯規 / 換人 / 違例 / 跳球：toast 浮窗
      if (
        action.actionType === 'block' ||
        action.actionType === 'steal' ||
        action.actionType === 'turnover' ||
        action.actionType === 'foul' ||
        action.actionType === 'substitution' ||
        action.actionType === 'violation' ||
        action.actionType === 'jumpball'
      ) {
        pushToast(action);
        // 換人 / 火鍋 / 抄截：順便高亮當事人（短暫）
        if (action.personId) {
          setState((s) => ({
            ...s,
            highlightedIds: new Set([action.personId!]),
          }));
          schedule(() => {
            setState((s) => ({
              ...s,
              highlightedIds: new Set(),
            }));
          }, 1500);
        }
        // 失誤 / 抄截 → 球權轉換，更新 lastActor；其他不更新（避免犯規/換人
        // 之類非「持球」事件影響下次傳球軌跡的起點）
        if (
          action.actionType === 'steal' ||
          action.actionType === 'turnover'
        ) {
          updateLastActor();
        }
        return;
      }
    },
    [playShotAnimation, playReboundAnimation, pushToast, showBanner, schedule],
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

      {/* 籃框震動效果（命中時） — 雙環 + 粒子特效 */}
      <AnimatePresence>
        {state.hoopShake && (
          <g key="hoop-shake">
            {/* 外擴金環 */}
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
            {/* 內層紅環（震動感） */}
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
            {/* 進球粒子（8 個射線） */}
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

      {/* 罰球指示器（顯示在罰球者頭上：1 ✓ 2 ✗ 之類） */}
      <AnimatePresence>
        {state.freeThrowIndicator && (
          <motion.g
            key={`ft-${state.freeThrowIndicator.current}-${state.freeThrowIndicator.made}`}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.3 }}
          >
            {/* 一排小圓圈，每個對應一罰 */}
            {Array.from(
              { length: state.freeThrowIndicator.total },
              (_, i) => {
                const idx = i + 1;
                const isCurrent = idx === state.freeThrowIndicator!.current;
                const dotX =
                  state.freeThrowIndicator!.pos.x -
                  ((state.freeThrowIndicator!.total - 1) * 11) / 2 +
                  i * 11;
                return (
                  <g key={idx}>
                    <circle
                      cx={dotX}
                      cy={state.freeThrowIndicator!.pos.y}
                      r={6}
                      fill={
                        isCurrent
                          ? state.freeThrowIndicator!.made
                            ? '#16a34a'
                            : '#dc2626'
                          : '#e5e7eb'
                      }
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                    {isCurrent && (
                      <text
                        x={dotX}
                        y={state.freeThrowIndicator!.pos.y + 2.5}
                        textAnchor="middle"
                        fontSize="8"
                        fontWeight="900"
                        fill="#ffffff"
                      >
                        {state.freeThrowIndicator!.made ? '✓' : '✗'}
                      </text>
                    )}
                  </g>
                );
              },
            )}
          </motion.g>
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

      {/* 全螢幕大字幕（節結束 / 比賽結束 / 暫停） */}
      <BannerLayer banner={state.banner} />
    </>
  );
}
