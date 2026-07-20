// P幣競猜 — 對帳（規格 §1.1：每日 ledger vs bet 聚合，不平即告警）
// 不變量：
//   I1 每張注單恰有一筆 PREDICTION_STAKE = -stake（冪等鍵 bet_stake:{betId}）
//   I2 每張注單的非本金淨入帳（派彩+退款+沖正）== 期望值(status)：
//      PENDING/LOST→0、WON→potentialPayout、PUSH/VOIDED→stake
//      （沖正後 status 已更正，沖正金額把淨額調到新期望值 → 不變量仍成立）
//   I3 不存在孤兒 ledger（PREDICTION_* 指向不存在的 bet）
// 全部用 raw SQL 聚合（一次掃描，不逐筆 N+1）。

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@betting-forum/database';
import { PrismaService } from '../common/prisma.service';

export interface ReconciliationIssue {
  invariant: 'I1_STAKE' | 'I2_CREDIT' | 'I3_ORPHAN';
  betId: string | null;
  detail: string;
}

export interface ReconciliationReport {
  ok: boolean;
  checkedBets: number;
  issues: ReconciliationIssue[];
  totals: { stakeSum: number; creditSum: number };
  ranAt: string;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  async run(): Promise<ReconciliationReport> {
    const issues: ReconciliationIssue[] = [];

    // I1：每注恰有一筆 -stake
    const i1 = await this.prisma.$queryRaw<Array<{ id: string; stake: number; amount: number | null }>>(Prisma.sql`
      SELECT b.id, b.stake, l.amount
      FROM bets b
      LEFT JOIN ledger_entries l ON l.idempotency_key = 'bet_stake:' || b.id
      WHERE l.id IS NULL OR l.amount <> -b.stake
    `);
    for (const r of i1) {
      issues.push({
        invariant: 'I1_STAKE',
        betId: r.id,
        detail: r.amount === null ? `無扣款 ledger（stake=${r.stake}）` : `扣款額不符：ledger=${r.amount}、應為 ${-r.stake}`,
      });
    }

    // I2：非本金淨入帳 == 期望值(status)
    const i2 = await this.prisma.$queryRaw<
      Array<{ id: string; status: string; stake: number; potential_payout: number; credited: number }>
    >(Prisma.sql`
      SELECT b.id, b.status::text AS status, b.stake, b.potential_payout,
             COALESCE(SUM(l.amount), 0)::int AS credited
      FROM bets b
      LEFT JOIN ledger_entries l
        ON l.ref_type = 'bet' AND l.ref_id = b.id AND l.reason <> 'PREDICTION_STAKE'
      GROUP BY b.id
      HAVING COALESCE(SUM(l.amount), 0) <> CASE b.status::text
        WHEN 'WON' THEN b.potential_payout
        WHEN 'PUSH' THEN b.stake
        WHEN 'VOIDED' THEN b.stake
        ELSE 0 END
    `);
    for (const r of i2) {
      const expected = r.status === 'WON' ? r.potential_payout : r.status === 'PUSH' || r.status === 'VOIDED' ? r.stake : 0;
      issues.push({
        invariant: 'I2_CREDIT',
        betId: r.id,
        detail: `status=${r.status} 淨入帳 ${r.credited}、應為 ${expected}`,
      });
    }

    // I3：孤兒 ledger（指向不存在的 bet）
    const i3 = await this.prisma.$queryRaw<Array<{ id: string; ref_id: string | null; reason: string }>>(Prisma.sql`
      SELECT l.id, l.ref_id, l.reason::text AS reason
      FROM ledger_entries l
      LEFT JOIN bets b ON b.id = l.ref_id
      WHERE l.reason::text IN ('PREDICTION_STAKE','PREDICTION_PAYOUT','PREDICTION_REFUND','PREDICTION_REVERSAL')
        AND l.ref_type = 'bet' AND b.id IS NULL
    `);
    for (const r of i3) {
      issues.push({ invariant: 'I3_ORPHAN', betId: r.ref_id, detail: `孤兒 ledger ${r.id}（${r.reason}）` });
    }

    // 總量（資訊用）
    const [{ checked }] = await this.prisma.$queryRaw<Array<{ checked: number }>>(
      Prisma.sql`SELECT COUNT(*)::int AS checked FROM bets`,
    );
    const [{ stake_sum, credit_sum }] = await this.prisma.$queryRaw<
      Array<{ stake_sum: number; credit_sum: number }>
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE reason::text = 'PREDICTION_STAKE'), 0)::int AS stake_sum,
        COALESCE(SUM(amount) FILTER (WHERE reason::text IN ('PREDICTION_PAYOUT','PREDICTION_REFUND','PREDICTION_REVERSAL')), 0)::int AS credit_sum
      FROM ledger_entries
    `);

    const report: ReconciliationReport = {
      ok: issues.length === 0,
      checkedBets: checked,
      issues,
      totals: { stakeSum: stake_sum, creditSum: credit_sum },
      ranAt: new Date().toISOString(),
    };

    if (report.ok) {
      this.logger.log(`對帳通過：${checked} 注、扣款 ${stake_sum}、入帳 ${credit_sum}`);
    } else {
      // 不平即告警：這是「帳」的最後防線，任何一筆都要人看
      this.logger.error(`🚨 對帳不平：${issues.length} 筆異常！${JSON.stringify(issues.slice(0, 10))}`);
    }
    return report;
  }

  constructor(private prisma: PrismaService) {}
}
