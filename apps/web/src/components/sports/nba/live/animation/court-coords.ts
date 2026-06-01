'use client';

/**
 * NBA 動畫直播：球場座標系常數
 *
 * 全場視角 viewBox：1000 x 620（球場 500 + 下方 dock 120）
 * - 中央 x = 500（中線）
 * - 左籃框 (52.5, 250)、右籃框 (947.5, 250)
 * - 左罰球線 x = 190、右罰球線 x = 810
 * - Dock 區：y = 500~620，雙隊各 5 個球員頭像橫向排列
 */

export const COURT_W = 1000;
export const COURT_H = 500; // 純球場部分（畫線、籃框、聚光燈到這為止）
export const DOCK_H = 120; // 下方球員 dock 高度
export const TOTAL_H = COURT_H + DOCK_H; // SVG viewBox 總高度
export const COURT_CX = COURT_W / 2;
export const COURT_CY = COURT_H / 2;

export const LEFT_HOOP_X = 52.5;
export const RIGHT_HOOP_X = COURT_W - 52.5;
export const HOOP_Y = COURT_H / 2;

export const LEFT_FT_LINE_X = 190; // 左罰球線（19 ft from baseline）
export const RIGHT_FT_LINE_X = COURT_W - 190; // 右罰球線

/**
 * 球員 Dock 座標（球場下方一排，雙隊各 5 個）
 *
 * 設計改變（2026-06-01 設計顧問建議）：
 * 之前用「球員固定站位 5v5 在球場上」、依 personId hash 分配。
 * 問題：96% 場次會有 2 個以上球員疊在同一站位（5! / 5^5 = 3.84%）；
 * 且 hash 分配無視球員實際 NBA 位置（C 可能被分到 PG 站位）。
 *
 * 解法：放棄「球員在球場上」假設，改成「球場下方 dock 一排」：
 * - 球場 SVG 內只剩球 + 軌跡 + 籃框震動 + 大字 + toast/banner
 * - 球員頭像 dock 在球場下方一排，事件發生時 dock 球員跳起來高亮
 * - 軌跡從「dock 球員位置」飛到「球場上的座標」（籃框）
 *
 * Dock 區：y = COURT_H ~ TOTAL_H（500~620），客隊在左、主隊在右、中間留空
 */

// 客隊 dock：x = 50~450，平均 5 等分（中心點分別在 90, 170, 250, 330, 410）
// 主隊 dock：x = 550~950（中心點 590, 670, 750, 830, 910）
// 中間 100px 區段留空（450~550），作為「中線視覺延伸」與主客分隔
const DOCK_Y = COURT_H + DOCK_H / 2; // 560
const DOCK_AWAY_START = 90;
const DOCK_HOME_START = 590;
const DOCK_SPACING = 80;

export interface DockSlot {
  x: number;
  y: number;
}

export const AWAY_DOCK: DockSlot[] = Array.from({ length: 5 }, (_, i) => ({
  x: DOCK_AWAY_START + i * DOCK_SPACING,
  y: DOCK_Y,
}));

export const HOME_DOCK: DockSlot[] = Array.from({ length: 5 }, (_, i) => ({
  x: DOCK_HOME_START + i * DOCK_SPACING,
  y: DOCK_Y,
}));

/**
 * 取得球員的 dock 座標
 *
 * @param indexInTeam 球員在自己隊伍 oncourt 陣列中的 index（0~4）
 * @param isHome 是否為主隊
 */
export function getDockPosition(
  indexInTeam: number,
  isHome: boolean,
): { x: number; y: number } {
  const dock = isHome ? HOME_DOCK : AWAY_DOCK;
  const slot = dock[Math.max(0, Math.min(4, indexInTeam))];
  return { x: slot.x, y: slot.y };
}

/**
 * 從「球員 dock index 對應表」算出某 personId 的 dock 位置
 * 用於 AnimationOrchestrator：傳入 oncourt 球員陣列、給每位算 dock 位置
 */
export function buildPlayerDockMap(
  oncourtPlayers: { personId: number }[],
  isHome: boolean,
): Map<number, { x: number; y: number }> {
  const map = new Map<number, { x: number; y: number }>();
  oncourtPlayers.slice(0, 5).forEach((p, i) => {
    map.set(p.personId, getDockPosition(i, isHome));
  });
  return map;
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
  // 用 Math.max(0, ...) 夾住 SVG 上邊界，避免球的拋物線中段飛出場外
  // （Bezier 中段必貼近控制點，控制點為負就會看到球飛到計分板上方）
  const ctrlY = Math.max(0, Math.min(from.y, to.y) - height);
  return `M ${from.x} ${from.y} Q ${midX} ${ctrlY} ${to.x} ${to.y}`;
}
