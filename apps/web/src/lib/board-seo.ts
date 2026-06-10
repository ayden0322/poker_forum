/**
 * 板塊 SEO 索引控制
 *
 * 背景：部分運動板塊已在 seed.ts 建立為論壇板塊，但前端尚未渲染賽事數據 widget
 * （BoardPageClient 目前只對 mlb / nba / world-cup / friendlies 渲染數據）。
 * 這些「只有空討論區、沒有賽事數據」的板塊屬於薄內容，已被 Google 爬到會稀釋整站品質、
 * 拖累已排名的 NBA / MLB。
 *
 * 策略（顧問拍板 2026-06-10）：先 noindex，補一個開一個——某個聯賽的數據 widget 上線後，
 * 就把它的 slug 從這份清單移除，讓它重新可被索引。
 *
 * ⚠️ 維護方式：這是「待補數據」黑名單，不是永久設定。每接上一個聯賽就刪一行。
 */
export const THIN_BOARD_SLUGS = new Set<string>([
  // 仍無賽事數據 widget 的板塊。23 個籃球 roster 板塊皆已上線數據（live 渲染排行）、可索引。
  // t1-league 板塊已於 2026-06-10 刪除（0 貼文孤兒）。
  'other-basketball', // 純討論板（FIBA 臨時賽事等），無單一聯賽數據
]);

/** 該板塊目前是否應該被搜尋引擎索引 */
export function isBoardIndexable(slug: string): boolean {
  return !THIN_BOARD_SLUGS.has(slug);
}
