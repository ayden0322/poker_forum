import { PrismaService } from './prisma.service';
import { isPredictionEnabled } from '../predictions/prediction.flags';

/**
 * 貼文/留言 feed 用的「精簡戰績章」。
 *
 * 為什麼要門檻：戰績頁的設計原則是「勝率永遠跟平均賠率、注數一起出現」——透明本身是防禦。
 * feed 塞不下平均賠率，所以改用「場數門檻 + 場數同列顯示」當防線：
 *   - 低於門檻不顯示 → 擋掉「3 戰 3 勝 = 100%」這種樣本太小卻最醒目的誤導
 *   - 顯示時一定帶場數 → 讀者自己能判斷樣本大小
 * 同時滿足 growth 的「新手卡別掛 0 勝 0 負」。
 *
 * 效能：一次查一批作者（單一 SQL groupBy），不做 N+1。
 */
export const AUTHOR_RECORD_MIN_SETTLED = 10;

export interface AuthorRecord {
  winRate: number; // %
  settled: number; // 已結算場數（勝/負）
}

/** 批次取作者精簡戰績；競猜關閉時回空 Map（fail-closed）。 */
export async function authorRecords(
  prisma: PrismaService,
  userIds: string[],
): Promise<Map<string, AuthorRecord>> {
  const out = new Map<string, AuthorRecord>();
  if (!isPredictionEnabled()) return out; // fail-closed：功能沒開就不洩戰績
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return out;

  const rows = await prisma.$queryRaw<Array<{ user_id: string; settled: number; wins: number }>>`
    SELECT user_id,
           COUNT(*)::int AS settled,
           COUNT(*) FILTER (WHERE status = 'WON')::int AS wins
    FROM bets
    WHERE user_id = ANY(${ids}::text[]) AND status IN ('WON', 'LOST')
    GROUP BY user_id
  `;
  for (const r of rows) {
    if (r.settled < AUTHOR_RECORD_MIN_SETTLED) continue; // 門檻內不外送，前端就不用再判一次
    out.set(r.user_id, { winRate: Math.round((r.wins / r.settled) * 1000) / 10, settled: r.settled });
  }
  return out;
}
