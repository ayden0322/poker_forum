// P幣競猜 — admin 沖正工具（規格 §4.4：客服糾紛/比分改判的人工修正）
// 原則：
//   - ledger 永遠 append-only：沖正=另記 PREDICTION_REVERSAL 一筆，不改舊帳
//   - bet 狀態的「已結算 → 更正結算」是唯一允許的例外轉移，只能走這裡（有 RBAC + ledger 軌跡），
//     結算 cron 永遠不會回頭改已結算注單
//   - 追討（WON→LOST 收回派彩）走 debitInTx：餘額不足會拋錯 → 回報 admin 人工處理（不硬扣成負數）

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EconomyService, InsufficientBalanceError } from '../economy/economy.service';

type SettledStatus = 'WON' | 'LOST' | 'PUSH';
const SETTLED: SettledStatus[] = ['WON', 'LOST', 'PUSH'];

function fail(code: string, message: string, status = HttpStatus.BAD_REQUEST): never {
  throw new HttpException({ code, message }, status);
}

@Injectable()
export class PredictionsAdminService {
  private readonly logger = new Logger(PredictionsAdminService.name);

  constructor(
    private prisma: PrismaService,
    private economy: EconomyService,
  ) {}

  /** 手動作廢（僅限未結算 PENDING）：退回本金。用於賽前糾紛/錯盤下架。 */
  async voidBet(betId: string, adminId: string, reason: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const res = await tx.bet.updateMany({
        where: { id: betId, status: 'PENDING' }, // 樂觀鎖：與結算 cron 併發時只有一邊成功
        data: { status: 'VOIDED', settledAt: new Date() },
      });
      if (res.count === 0) return null;
      const bet = await tx.bet.findUniqueOrThrow({ where: { id: betId } });
      await this.economy.creditInTx(tx, {
        userId: bet.userId,
        currency: 'P',
        amount: bet.stake,
        reason: 'PREDICTION_REFUND',
        refType: 'bet',
        refId: betId,
        idempotencyKey: `bet_refund:${betId}`,
      });
      return bet;
    });
    if (!result) fail('NOT_PENDING', '注單不是待結算狀態（可能已被結算），不可作廢', HttpStatus.CONFLICT);
    this.logger.warn(`admin 作廢注單：bet=${betId} by=${adminId} 原因=${reason}，退 ${result.stake}P`);
    return { betId, status: 'VOIDED', refunded: result.stake };
  }

  /**
   * 沖正已結算注單（比分改判等）：狀態改為更正後結果，差額走 PREDICTION_REVERSAL。
   * delta = 新期望入帳 − 舊期望入帳；正=補派、負=追討。
   */
  async reverseBet(betId: string, correctedOutcome: SettledStatus, adminId: string, reason: string) {
    const bet = await this.prisma.bet.findUnique({ where: { id: betId } });
    if (!bet) fail('NOT_FOUND', '注單不存在', HttpStatus.NOT_FOUND);
    if (!SETTLED.includes(bet.status as SettledStatus)) {
      fail('NOT_SETTLED', `僅已結算注單可沖正（目前 ${bet.status}）`, HttpStatus.CONFLICT);
    }
    if (bet.status === correctedOutcome) fail('SAME_OUTCOME', '更正結果與現狀相同');

    const creditOf = (s: SettledStatus) => (s === 'WON' ? bet.potentialPayout : s === 'PUSH' ? bet.stake : 0);
    const delta = creditOf(correctedOutcome) - creditOf(bet.status as SettledStatus);
    const idempotencyKey = `bet_reversal:${betId}:${bet.status}>${correctedOutcome}`;

    try {
      await this.prisma.$transaction(async (tx) => {
        const res = await tx.bet.updateMany({
          where: { id: betId, status: bet.status }, // 樂觀鎖：讀取後被別人改過就失敗
          data: { status: correctedOutcome, settledAt: new Date() },
        });
        if (res.count === 0) fail('CONFLICT', '注單狀態剛被變更，請重讀後再試', HttpStatus.CONFLICT);

        if (delta > 0) {
          await this.economy.creditInTx(tx, {
            userId: bet.userId, currency: 'P', amount: delta,
            reason: 'PREDICTION_REVERSAL', refType: 'bet', refId: betId, idempotencyKey,
          });
        } else if (delta < 0) {
          await this.economy.debitInTx(tx, {
            userId: bet.userId, currency: 'P', amount: -delta,
            reason: 'PREDICTION_REVERSAL', refType: 'bet', refId: betId, idempotencyKey,
          });
        }
      });
    } catch (e) {
      if (e instanceof InsufficientBalanceError) {
        fail('CLAWBACK_INSUFFICIENT', `追討 ${-delta}P 失敗：使用者餘額不足（${e.have}P）。請先以 ADMIN_ADJUST 處理或與會員協調`, HttpStatus.CONFLICT);
      }
      throw e;
    }

    this.logger.warn(
      `admin 沖正注單：bet=${betId} ${bet.status}→${correctedOutcome} delta=${delta} by=${adminId} 原因=${reason}`,
    );
    return { betId, from: bet.status, to: correctedOutcome, delta };
  }

  /** 注單查詢（客服用：依 betId / userId） */
  async findBets(query: { betId?: string; userId?: string; take?: number }): Promise<unknown[]> {
    return this.prisma.bet.findMany({
      where: {
        ...(query.betId ? { id: query.betId } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.take ?? 20, 100),
      include: {
        match: { select: { boardSlug: true, homeName: true, awayName: true, startTime: true, apiStatus: true } },
        user: { select: { nickname: true } },
      },
    });
  }
}
