'use client';

/**
 * NBA 動畫直播：球場座標系常數
 *
 * 全場視角 viewBox：1000 x 500（跟 CourtChart 一致）
 * - 中央 x = 500（中線）
 * - 左籃框 (52.5, 250)、右籃框 (947.5, 250)
 * - 左罰球線 x = 190、右罰球線 x = 810
 */

export const COURT_W = 1000;
export const COURT_H = 500;
export const COURT_CX = COURT_W / 2;
export const COURT_CY = COURT_H / 2;

export const LEFT_HOOP_X = 52.5;
export const RIGHT_HOOP_X = COURT_W - 52.5;
export const HOOP_Y = COURT_H / 2;

export const LEFT_FT_LINE_X = 190; // 左罰球線（19 ft from baseline）
export const RIGHT_FT_LINE_X = COURT_W - 190; // 右罰球線

/**
 * 球員 5v5 站位（依進攻方向）
 *
 * 客隊攻左框，所以客隊球員主要站在「左半場 + 中場」
 * 主隊攻右框，所以主隊球員主要站在「右半場 + 中場」
 *
 * 5 個站位對應 NBA 標準陣型：
 * - PG (Point Guard)：控球後衛、通常在頂端
 * - SG (Shooting Guard)：得分後衛、側翼
 * - SF (Small Forward)：小前鋒、側翼
 * - PF (Power Forward)：大前鋒、靠籃下
 * - C (Center)：中鋒、籃下
 *
 * 數值是進攻時的「無球站位」基準，會被個別事件的座標覆蓋
 */

export interface CourtPosition {
  x: number;
  y: number;
  role: 'PG' | 'SG' | 'SF' | 'PF' | 'C';
}

// 主隊（攻右框）站位
export const HOME_POSITIONS: CourtPosition[] = [
  { x: 650, y: 250, role: 'PG' }, // 控球（在頂弧線附近）
  { x: 750, y: 110, role: 'SG' }, // 右翼三分線
  { x: 750, y: 390, role: 'SF' }, // 左翼三分線
  { x: 870, y: 170, role: 'PF' }, // 右側籃下
  { x: 870, y: 330, role: 'C' }, // 左側籃下
];

// 客隊（攻左框）站位
export const AWAY_POSITIONS: CourtPosition[] = [
  { x: 350, y: 250, role: 'PG' }, // 控球
  { x: 250, y: 110, role: 'SG' }, // 右翼三分線
  { x: 250, y: 390, role: 'SF' }, // 左翼三分線
  { x: 130, y: 170, role: 'PF' }, // 右側籃下
  { x: 130, y: 330, role: 'C' }, // 左側籃下
];

/**
 * 根據 person ID 計算他在場上的「站位 index」（0~4），用於分配 5 個固定位置
 * 用 personId hash 取 mod 5，確保同一場比賽同一球員位置固定
 */
export function positionIndexForPlayer(personId: number): number {
  return Math.abs(personId) % 5;
}

/**
 * 取得球員在場上的座標
 *
 * @param personId NBA player id
 * @param isHome 是否為主隊球員
 * @param shotCoords 若是投籃事件、附帶投籃座標（從 cdn 拿）
 * @returns SVG 座標
 */
export function getPlayerPosition(
  personId: number,
  isHome: boolean,
  shotCoords?: { x?: number; y?: number },
): { x: number; y: number } {
  // 若有投籃座標，優先用（投籃事件就是球員當下位置）
  if (shotCoords?.x !== undefined && shotCoords?.y !== undefined) {
    // NBA cdn shot 座標：x ∈ [0, 100]（球員視角左右）、y ∈ [0, 100]（0=底線、100=中線）
    if (isHome) {
      // 主隊攻右：cx 從右底線到中線
      return {
        x: RIGHT_HOOP_X - (shotCoords.y / 100) * (RIGHT_HOOP_X - COURT_CX),
        y: (shotCoords.x / 100) * COURT_H,
      };
    }
    // 客隊攻左：cx 從左底線到中線
    return {
      x: LEFT_HOOP_X + (shotCoords.y / 100) * (COURT_CX - LEFT_HOOP_X),
      y: (shotCoords.x / 100) * COURT_H,
    };
  }

  // 沒投籃座標：回到固定站位
  const positions = isHome ? HOME_POSITIONS : AWAY_POSITIONS;
  const idx = positionIndexForPlayer(personId);
  return { x: positions[idx].x, y: positions[idx].y };
}

/**
 * 取得籃框座標（投籃目標）
 */
export function getHoopPosition(isHomeAttacking: boolean): { x: number; y: number } {
  return isHomeAttacking
    ? { x: RIGHT_HOOP_X, y: HOOP_Y }
    : { x: LEFT_HOOP_X, y: HOOP_Y };
}

/**
 * 取得罰球線位置（球員罰球時站的位置）
 */
export function getFreeThrowLinePosition(isHomeAttacking: boolean): {
  x: number;
  y: number;
} {
  return isHomeAttacking
    ? { x: RIGHT_FT_LINE_X, y: HOOP_Y }
    : { x: LEFT_FT_LINE_X, y: HOOP_Y };
}

/**
 * 計算拋物線 SVG path（從起點到終點的曲線）
 *
 * 使用 Quadratic Bezier，控制點放在中點上方（讓球「飛」起來）
 *
 * @param from 起點
 * @param to 終點
 * @param arcHeight 拋物線高度（預設根據兩點距離自動計算）
 */
export function parabolaPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  arcHeight?: number,
): string {
  const midX = (from.x + to.x) / 2;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const height = arcHeight ?? Math.min(distance * 0.35, 120);
  // 控制點在中點正上方
  const ctrlY = Math.min(from.y, to.y) - height;
  return `M ${from.x} ${from.y} Q ${midX} ${ctrlY} ${to.x} ${to.y}`;
}
