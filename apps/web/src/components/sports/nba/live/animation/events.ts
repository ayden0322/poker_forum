'use client';

import { useEffect, useRef } from 'react';
import type { NBALiveAction } from '../types';

/**
 * useNewActions
 *
 * 監聽 actions 陣列，每次出現「actionNumber > 上次看到的最大值」的事件時，
 * 對每個新事件依序呼叫 onNew callback。
 *
 * 設計重點：
 * - 首次載入時不觸發 callback（避免歷史 15 個事件一次性播放動畫）
 * - 用 useRef 鎖定 callback，避免每次 render 重新訂閱
 * - 新事件依 actionNumber 由小到大排序，確保動畫順序正確
 *
 * 適用情境：
 * - 動畫直播板 polling 拿到新 snapshot 時，要播放「上次 → 這次」之間新增的事件動畫
 * - 進行中比賽每 3 秒輪詢一次，每輪可能新增 0~3 個事件
 */
export function useNewActions(
  actions: NBALiveAction[] | undefined,
  onNew: (action: NBALiveAction) => void,
) {
  const lastSeenRef = useRef<number>(-1);
  const initializedRef = useRef<boolean>(false);
  const onNewRef = useRef(onNew);

  // 同步 callback ref，讓 useEffect 不用把 onNew 放進 deps
  useEffect(() => {
    onNewRef.current = onNew;
  }, [onNew]);

  useEffect(() => {
    if (!actions || actions.length === 0) return;

    const maxActionNum = Math.max(...actions.map((a) => a.actionNumber));

    // 首次載入：只記錄目前最大 actionNumber，不觸發任何動畫
    if (!initializedRef.current) {
      lastSeenRef.current = maxActionNum;
      initializedRef.current = true;
      return;
    }

    // 找出比上次看到還新的事件、依序播放
    const newActions = actions
      .filter((a) => a.actionNumber > lastSeenRef.current)
      .sort((a, b) => a.actionNumber - b.actionNumber);

    if (newActions.length > 0) {
      newActions.forEach((a) => onNewRef.current(a));
      lastSeenRef.current = maxActionNum;
    }
  }, [actions]);
}

/**
 * 把 NBA cdn 的 actionType 分類成「我們有實作動畫的類型」與「其他」。
 * 動畫協調器用這個過濾、避免對「period」「game」這種無動畫意義的事件做事。
 */
export type AnimatableActionType =
  | '2pt'
  | '3pt'
  | 'freethrow'
  | 'rebound'
  | 'block'
  | 'steal'
  | 'turnover'
  | 'foul'
  | 'substitution'
  | 'timeout';

export const ANIMATABLE_ACTION_TYPES: ReadonlySet<string> = new Set<AnimatableActionType>([
  '2pt',
  '3pt',
  'freethrow',
  'rebound',
  'block',
  'steal',
  'turnover',
  'foul',
  'substitution',
  'timeout',
]);

export function isAnimatable(action: NBALiveAction): boolean {
  return ANIMATABLE_ACTION_TYPES.has(action.actionType);
}

/**
 * 是否為「得分事件」（需要播放得分大字幕、籃框震動）
 */
export function isScoringEvent(action: NBALiveAction): boolean {
  return (
    (action.actionType === '2pt' ||
      action.actionType === '3pt' ||
      action.actionType === 'freethrow') &&
    action.shotResult === 'Made'
  );
}

/**
 * 是否為「投籃事件」（含罰球、命中或未中）
 */
export function isShotEvent(action: NBALiveAction): boolean {
  return (
    action.actionType === '2pt' ||
    action.actionType === '3pt' ||
    action.actionType === 'freethrow'
  );
}
