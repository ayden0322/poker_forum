/**
 * 比賽窗判斷 —— 高頻輪詢（refreshLive）前的 gate。
 *
 * 為什麼用「排程開賽時間」開窗，而不是用 DB 的 `status === 'live'`？
 *   live 狀態本身正是靠這支輪詢打 API 打出來的。若拿 live 當 gate，會雞生蛋：
 *   沒人打 API → status 永遠不會變 live → 永遠進不去輪詢。
 *   所以這裡只看 kickoffAt（賽程表，由各自的 fullSync / dailySync 維護），
 *   落在 [開賽前 PRE_KICKOFF, 開賽後 POST_KICKOFF] 區間內才放行。
 *
 * 失效保護：就算這個 gate 因賽程時間誤差而誤關，世界盃 fullSync（每 5 分）與
 *   友誼賽 dailySync 仍會無條件同步比分（只是少了 30 秒粒度與細節），不會整個失聯。
 */

/** 開賽前提早開窗的緩衝（毫秒）—— 提早 10 分鐘開始輪詢，接住開球瞬間 */
const PRE_KICKOFF_MS = 10 * 60 * 1000;
/** 開賽後關窗的緩衝（毫秒）—— 90 分 + 中場 + 傷停 + 淘汰賽延長賽/PK，抓 180 分保險 */
const POST_KICKOFF_MS = 180 * 60 * 1000;

/** Prisma model delegate 只需要 count 能力 */
type CountableDelegate = {
  count: (args: { where: Record<string, unknown> }) => Promise<number>;
};

/**
 * 現在是否落在任何一場「未完賽」排程比賽的比賽窗內。
 * @param delegate 對應的 Prisma model（如 prisma.worldCupMatch / prisma.friendlyMatch）
 */
export async function hasActiveMatchWindow(
  delegate: CountableDelegate,
  now: Date = new Date(),
): Promise<boolean> {
  const from = new Date(now.getTime() - POST_KICKOFF_MS); // 開賽不早於這個時間（窗還沒關）
  const to = new Date(now.getTime() + PRE_KICKOFF_MS); // 開賽不晚於這個時間（窗已開）
  const n = await delegate.count({
    where: {
      kickoffAt: { gte: from, lte: to },
      status: { not: 'finished' },
    },
  });
  return n > 0;
}
