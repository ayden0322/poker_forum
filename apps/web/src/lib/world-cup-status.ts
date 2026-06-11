/**
 * FIFA 世界盃 2026 — 比賽狀態推算（前端共用）
 *
 * 背景：目前資料源為 GitHub 公開賽程，只有開賽時程、沒有即時比分/狀態 feed。
 * 因此前後台一律「依開賽時間自動推算」狀態，忽略 DB 手動欄位：
 *   now < kickoff                         → scheduled（尚未開賽）
 *   kickoff ≤ now < kickoff + 比賽視窗     → live（比賽中）
 *   now ≥ kickoff + 比賽視窗               → finished（已結束）
 *
 * ⚠️ 與後端 world-cup.service.ts 的 LIVE_WINDOW_MS 必須一致。
 */

/** 開球到視為完場的視窗：90 分鐘 + 中場 15 + 傷停/賽後緩衝 ≈ 130 分鐘 */
export const WC_LIVE_WINDOW_MS = 130 * 60 * 1000;

export type WcStatus = 'scheduled' | 'live' | 'finished';

export function deriveWcStatus(kickoffAtIso: string, now: number = Date.now()): WcStatus {
  const k = new Date(kickoffAtIso).getTime();
  if (Number.isNaN(k) || now < k) return 'scheduled';
  if (now < k + WC_LIVE_WINDOW_MS) return 'live';
  return 'finished';
}

/** 是否已有實際比分（admin 後台輸入後才有；無資料源時恆為 false） */
export function wcHasScore(
  home: number | null | undefined,
  away: number | null | undefined,
): boolean {
  return home != null && away != null;
}
