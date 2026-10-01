/**
 * 空結果（[]）的快取上限秒數。
 *
 * 踩坑（2026-10-01）：API-Sports 訂閱到期退回免費方案時回 []，被當正常資料快取 24 小時，
 * 續費後球隊頁仍空一整天。空結果改只存幾分鐘：真的沒資料（如今日無賽）也不會每次瀏覽都打 API，
 * 上游恢復後幾分鐘內自動回正。
 */
export const EMPTY_RESULT_TTL = 300;

/** 依結果決定快取秒數：空陣列最多存 EMPTY_RESULT_TTL，其他照原 ttl */
export function cacheTtlFor(data: unknown, ttl: number): number {
  return Array.isArray(data) && data.length === 0 ? Math.min(ttl, EMPTY_RESULT_TTL) : ttl;
}
