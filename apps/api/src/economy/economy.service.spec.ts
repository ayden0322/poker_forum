/**
 * 帳本不變量整合測試（連真實 postgres）。
 * 守住四件「錯了難收」的事：
 *  1. 冪等：同 idempotencyKey 重送不重複入帳
 *  2. 並發不丟單：N 筆並發各自入帳、無 race condition
 *  3. 餘額不可負：debit 扣不動就拋錯、餘額不變
 *  4. append-only / 對帳：sum(ledger amount) === 當前餘額
 *
 * 跑法（Docker 內，有 DATABASE_URL）：
 *   docker compose run --rm api sh -c "cd apps/api && pnpm test"
 */
import { PrismaClient, Currency, LedgerReason } from '@betting-forum/database';
import { EconomyService, InsufficientBalanceError } from './economy.service';
import type { PrismaService } from '../common/prisma.service';

const prisma = new PrismaClient();
const economy = new EconomyService(prisma as unknown as PrismaService);

let userId: string;

beforeAll(async () => {
  await prisma.$connect();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({ data: { nickname: `jest-econ-${suffix}` } });
  userId = user.id;
});

afterAll(async () => {
  const accounts = await prisma.walletAccount.findMany({ where: { userId } });
  await prisma.ledgerEntry.deleteMany({ where: { accountId: { in: accounts.map((a) => a.id) } } });
  await prisma.walletAccount.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

async function ledgerSum(currency: Currency): Promise<number> {
  const agg = await prisma.ledgerEntry.aggregate({
    where: { account: { userId, currency } },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

describe('EconomyService 帳本不變量', () => {
  it('credit 冪等：同 key 重送只入帳一次', async () => {
    const key = `credit-idem-${userId}`;
    await economy.credit({ userId, currency: Currency.G, amount: 50, reason: LedgerReason.TASK_REWARD, idempotencyKey: key });
    await economy.credit({ userId, currency: Currency.G, amount: 50, reason: LedgerReason.TASK_REWARD, idempotencyKey: key });

    expect(await economy.getBalance(userId, Currency.G)).toBe(50);
    expect(await prisma.ledgerEntry.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('並發不丟單：10 筆並發 +10 → 餘額 100、帳本 10 列', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        economy.credit({
          userId,
          currency: Currency.P,
          amount: 10,
          reason: LedgerReason.ADMIN_ADJUST,
          idempotencyKey: `concurrent-${userId}-${i}`,
        }),
      ),
    );

    expect(await economy.getBalance(userId, Currency.P)).toBe(100);
    expect(await prisma.ledgerEntry.count({ where: { account: { userId, currency: Currency.P } } })).toBe(10);
  });

  it('debit 成功：扣款 + balanceAfter 快照正確', async () => {
    // G 目前 50 → 扣 20 → 30
    const entry = await economy.debit({
      userId,
      currency: Currency.G,
      amount: 20,
      reason: LedgerReason.SHOP_PURCHASE,
      idempotencyKey: `debit-ok-${userId}`,
    });

    expect(entry.amount).toBe(-20);
    expect(entry.balanceAfter).toBe(30);
    expect(await economy.getBalance(userId, Currency.G)).toBe(30);
  });

  it('餘額不足：debit 扣不動 → 拋 InsufficientBalanceError、餘額不變', async () => {
    const before = await economy.getBalance(userId, Currency.G); // 30
    await expect(
      economy.debit({
        userId,
        currency: Currency.G,
        amount: 999_999,
        reason: LedgerReason.SHOP_PURCHASE,
        idempotencyKey: `debit-insufficient-${userId}`,
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);

    expect(await economy.getBalance(userId, Currency.G)).toBe(before);
    // 失敗的扣款不應留下任何帳本列
    expect(await prisma.ledgerEntry.count({ where: { idempotencyKey: `debit-insufficient-${userId}` } })).toBe(0);
  });

  it('debit 冪等：同 key 重送只扣一次', async () => {
    const key = `debit-idem-${userId}`;
    await economy.debit({ userId, currency: Currency.G, amount: 10, reason: LedgerReason.SHOP_PURCHASE, idempotencyKey: key });
    await economy.debit({ userId, currency: Currency.G, amount: 10, reason: LedgerReason.SHOP_PURCHASE, idempotencyKey: key });

    // G: 30 → 20（只扣一次）
    expect(await economy.getBalance(userId, Currency.G)).toBe(20);
    expect(await prisma.ledgerEntry.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('對帳：sum(ledger amount) === 當前餘額（append-only 一致性）', async () => {
    expect(await ledgerSum(Currency.G)).toBe(await economy.getBalance(userId, Currency.G)); // 20
    expect(await ledgerSum(Currency.P)).toBe(await economy.getBalance(userId, Currency.P)); // 100
  });

  it('amount 必須為正整數', async () => {
    await expect(
      economy.credit({ userId, currency: Currency.G, amount: 0, reason: LedgerReason.ADMIN_ADJUST, idempotencyKey: `zero-${userId}` }),
    ).rejects.toThrow();
    await expect(
      economy.credit({ userId, currency: Currency.G, amount: -5, reason: LedgerReason.ADMIN_ADJUST, idempotencyKey: `neg-${userId}` }),
    ).rejects.toThrow();
  });
});
