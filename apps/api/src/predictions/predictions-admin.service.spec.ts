import { HttpException } from '@nestjs/common';
import { Prisma } from '@betting-forum/database';
import { PredictionsAdminService } from './predictions-admin.service';
import { InsufficientBalanceError } from '../economy/economy.service';

const D = (n: number) => new Prisma.Decimal(n);

function makeMocks(bet?: Partial<Record<string, unknown>>) {
  const base = {
    id: 'b1', userId: 'u1', stake: 500, potentialPayout: 900,
    lockedOdds: D(1.8), status: 'WON', line: null,
  };
  const row = { ...base, ...bet };
  const txMock = {
    bet: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(row),
    },
  };
  const prisma: any = {
    bet: { findUnique: jest.fn().mockResolvedValue(row), findMany: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(txMock)),
  };
  const economy: any = {
    creditInTx: jest.fn().mockResolvedValue({}),
    debitInTx: jest.fn().mockResolvedValue({}),
  };
  return { prisma, economy, txMock, row };
}

async function expectFail(p: Promise<unknown>, code: string) {
  try {
    await p;
    fail(`應拒絕 ${code}`);
  } catch (e) {
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getResponse()).toMatchObject({ code });
  }
}

describe('PredictionsAdminService', () => {
  describe('voidBet', () => {
    it('PENDING 注單作廢：樂觀鎖轉移 + 退本金（bet_refund 冪等鍵）', async () => {
      const { prisma, economy, txMock } = makeMocks({ status: 'PENDING' });
      const svc = new PredictionsAdminService(prisma, economy);
      const r = await svc.voidBet('b1', 'admin1', '錯盤下架');
      expect(r.refunded).toBe(500);
      expect(txMock.bet.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'b1', status: 'PENDING' } }),
      );
      expect(economy.creditInTx).toHaveBeenCalledWith(
        txMock,
        expect.objectContaining({ amount: 500, reason: 'PREDICTION_REFUND', idempotencyKey: 'bet_refund:b1' }),
      );
    });

    it('非 PENDING（已被結算）→ NOT_PENDING，不退款', async () => {
      const { prisma, economy, txMock } = makeMocks();
      txMock.bet.updateMany.mockResolvedValue({ count: 0 }); // 樂觀鎖失敗
      const svc = new PredictionsAdminService(prisma, economy);
      await expectFail(svc.voidBet('b1', 'admin1', 'x'), 'NOT_PENDING');
      expect(economy.creditInTx).not.toHaveBeenCalled();
    });
  });

  describe('reverseBet', () => {
    it('LOST→WON 補派：delta=+900 走 PREDICTION_REVERSAL', async () => {
      const { prisma, economy } = makeMocks({ status: 'LOST' });
      const svc = new PredictionsAdminService(prisma, economy);
      const r = await svc.reverseBet('b1', 'WON', 'admin1', '比分改判');
      expect(r).toMatchObject({ from: 'LOST', to: 'WON', delta: 900 });
      expect(economy.creditInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          amount: 900, reason: 'PREDICTION_REVERSAL', idempotencyKey: 'bet_reversal:b1:LOST>WON',
        }),
      );
    });

    it('WON→LOST 追討：delta=-900 走 debitInTx', async () => {
      const { prisma, economy } = makeMocks({ status: 'WON' });
      const svc = new PredictionsAdminService(prisma, economy);
      const r = await svc.reverseBet('b1', 'LOST', 'admin1', '比分改判');
      expect(r.delta).toBe(-900);
      expect(economy.debitInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amount: 900, reason: 'PREDICTION_REVERSAL' }),
      );
    });

    it('WON→PUSH：delta = stake - payout = -400', async () => {
      const { prisma, economy } = makeMocks({ status: 'WON' });
      const svc = new PredictionsAdminService(prisma, economy);
      const r = await svc.reverseBet('b1', 'PUSH', 'admin1', 'x');
      expect(r.delta).toBe(500 - 900);
      expect(economy.debitInTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amount: 400 }));
    });

    it('追討遇餘額不足 → CLAWBACK_INSUFFICIENT（不硬扣負數）', async () => {
      const { prisma, economy } = makeMocks({ status: 'WON' });
      economy.debitInTx.mockRejectedValue(new InsufficientBalanceError('P' as any, 900, 100));
      const svc = new PredictionsAdminService(prisma, economy);
      await expectFail(svc.reverseBet('b1', 'LOST', 'admin1', 'x'), 'CLAWBACK_INSUFFICIENT');
    });

    it('未結算注單不可沖正 → NOT_SETTLED', async () => {
      const { prisma, economy } = makeMocks({ status: 'PENDING' });
      const svc = new PredictionsAdminService(prisma, economy);
      await expectFail(svc.reverseBet('b1', 'WON', 'admin1', 'x'), 'NOT_SETTLED');
    });

    it('更正結果與現狀相同 → SAME_OUTCOME', async () => {
      const { prisma, economy } = makeMocks({ status: 'WON' });
      const svc = new PredictionsAdminService(prisma, economy);
      await expectFail(svc.reverseBet('b1', 'WON', 'admin1', 'x'), 'SAME_OUTCOME');
    });

    it('樂觀鎖：讀取後狀態被變更 → CONFLICT', async () => {
      const { prisma, economy, txMock } = makeMocks({ status: 'WON' });
      txMock.bet.updateMany.mockResolvedValue({ count: 0 });
      const svc = new PredictionsAdminService(prisma, economy);
      await expectFail(svc.reverseBet('b1', 'LOST', 'admin1', 'x'), 'CONFLICT');
      expect(economy.debitInTx).not.toHaveBeenCalled();
    });
  });
});
