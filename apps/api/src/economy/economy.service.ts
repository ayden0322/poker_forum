import { BadRequestException, Injectable } from '@nestjs/common';
import { Currency, LedgerEntry, LedgerReason, Prisma } from '@betting-forum/database';
import { PrismaService } from '../common/prisma.service';

/** 餘額不足（debit 時餘額 < 扣款額）。呼叫端自行決定如何回應使用者。 */
export class InsufficientBalanceError extends Error {
  constructor(
    public readonly currency: Currency,
    public readonly need: number,
    public readonly have: number,
  ) {
    super(`餘額不足：需要 ${need} ${currency}，目前 ${have} ${currency}`);
    this.name = 'InsufficientBalanceError';
  }
}

interface MoveParams {
  userId: string;
  currency: Currency;
  /** 金額，恆正（credit 加、debit 減） */
  amount: number;
  reason: LedgerReason;
  /** 關聯來源類型（如 'task' / 'shopOrder' / 'bet'），純記錄用 */
  refType?: string;
  refId?: string;
  /**
   * 冪等鍵：同一個 key 重送只會入帳一次。
   * 慣例：`{reason}:{userId}:{業務維度}`，例：`task:u123:login:2026-06-08`
   */
  idempotencyKey: string;
}

/**
 * 會員經濟帳本服務。
 *
 * 不變量（由本服務 + DB 約束共同保證）：
 *  1. append-only：只新增 LedgerEntry，從不 update/delete（沖正請記反向一筆）。
 *  2. 冪等：同 idempotencyKey 重送不重複入帳（DB @unique + 回查）。
 *  3. 餘額永不為負：debit 用條件式原子扣款，扣不動就拋 InsufficientBalanceError。
 *  4. 餘額 = 該帳戶所有 ledger amount 累加（balanceAfter 為每筆當下快照）。
 */
@Injectable()
export class EconomyService {
  constructor(private readonly prisma: PrismaService) {}

  /** 取得餘額（帳戶不存在視為 0） */
  async getBalance(userId: string, currency: Currency): Promise<number> {
    const acct = await this.prisma.walletAccount.findUnique({
      where: { userId_currency: { userId, currency } },
    });
    return acct?.balance ?? 0;
  }

  /** 入帳（加錢）。冪等。 */
  async credit(params: MoveParams): Promise<LedgerEntry> {
    this.assertPositive(params.amount);
    const existing = await this.prisma.ledgerEntry.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) return existing;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const account = await tx.walletAccount.upsert({
          where: { userId_currency: { userId: params.userId, currency: params.currency } },
          create: { userId: params.userId, currency: params.currency, balance: params.amount },
          update: { balance: { increment: params.amount } },
        });
        return tx.ledgerEntry.create({
          data: {
            accountId: account.id,
            amount: params.amount,
            reason: params.reason,
            refType: params.refType,
            refId: params.refId,
            idempotencyKey: params.idempotencyKey,
            balanceAfter: account.balance,
          },
        });
      });
    } catch (e) {
      return this.resolveConcurrentDup(params.idempotencyKey, e);
    }
  }

  /** 出帳（扣錢）。冪等；餘額不足拋 InsufficientBalanceError。 */
  async debit(params: MoveParams): Promise<LedgerEntry> {
    this.assertPositive(params.amount);
    const existing = await this.prisma.ledgerEntry.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) return existing;

    try {
      return await this.prisma.$transaction((tx) => this.debitInTx(tx, params));
    } catch (e) {
      return this.resolveConcurrentDup(params.idempotencyKey, e);
    }
  }

  /**
   * 在「呼叫端提供的交易」內扣款。讓「扣 G幣 + 發貨/下注」能在同一交易原子完成
   *（任一步失敗整批 rollback，不會發生付了款卻沒拿到東西）。
   *
   * 注意：呼叫端需自行處理 InsufficientBalanceError 與並發 P2002（同 idempotencyKey
   * 並發插入）——通常並發時讓該交易 rollback、視為對手已完成即可。
   */
  async debitInTx(
    tx: Prisma.TransactionClient,
    params: MoveParams,
  ): Promise<LedgerEntry> {
    this.assertPositive(params.amount);

    // 交易內冪等檢查：同 key 已存在直接回（避免重複扣）
    const existing = await tx.ledgerEntry.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) return existing;

    // 確保帳戶存在（餘額 0），才能做條件式扣款
    await tx.walletAccount.upsert({
      where: { userId_currency: { userId: params.userId, currency: params.currency } },
      create: { userId: params.userId, currency: params.currency, balance: 0 },
      update: {},
    });
    // 條件式原子扣款：餘額 >= amount 才扣，避免並發扣成負數
    const res = await tx.walletAccount.updateMany({
      where: { userId: params.userId, currency: params.currency, balance: { gte: params.amount } },
      data: { balance: { decrement: params.amount } },
    });
    if (res.count === 0) {
      const acct = await tx.walletAccount.findUnique({
        where: { userId_currency: { userId: params.userId, currency: params.currency } },
      });
      throw new InsufficientBalanceError(params.currency, params.amount, acct?.balance ?? 0);
    }
    const account = await tx.walletAccount.findUniqueOrThrow({
      where: { userId_currency: { userId: params.userId, currency: params.currency } },
    });
    return tx.ledgerEntry.create({
      data: {
        accountId: account.id,
        amount: -params.amount,
        reason: params.reason,
        refType: params.refType,
        refId: params.refId,
        idempotencyKey: params.idempotencyKey,
        balanceAfter: account.balance,
      },
    });
  }

  /**
   * 在「呼叫端提供的交易」內入帳。與 debitInTx 對稱：讓「結算派彩/退款 + 注單狀態轉移」
   * 能在同一交易原子完成（任一步失敗整批 rollback，不會發生狀態轉了卻沒入帳）。
   * 冪等由交易內回查 + DB @unique 雙保險（並發 P2002 由呼叫端 rollback 處理）。
   */
  async creditInTx(
    tx: Prisma.TransactionClient,
    params: MoveParams,
  ): Promise<LedgerEntry> {
    this.assertPositive(params.amount);

    const existing = await tx.ledgerEntry.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) return existing;

    const account = await tx.walletAccount.upsert({
      where: { userId_currency: { userId: params.userId, currency: params.currency } },
      create: { userId: params.userId, currency: params.currency, balance: params.amount },
      update: { balance: { increment: params.amount } },
    });
    return tx.ledgerEntry.create({
      data: {
        accountId: account.id,
        amount: params.amount,
        reason: params.reason,
        refType: params.refType,
        refId: params.refId,
        idempotencyKey: params.idempotencyKey,
        balanceAfter: account.balance,
      },
    });
  }

  /**
   * G→P 兌換（單向，規格：預設 100G=1000P；比例之後搬後台可調）。
   * 同一交易內：扣 G + 入 P（兩筆 ledger 同 reason EXCHANGE_G_TO_P、同 requestId 尾碼），
   * 冪等：同 requestId 重送不重複兌換。
   */
  async exchangeGtoP(userId: string, gAmount: number, requestId: string): Promise<{ g: number; p: number; pGained: number }> {
    this.assertPositive(gAmount);
    const pGained = gAmount * EconomyService.EXCHANGE_P_PER_G;

    await this.prisma.$transaction(async (tx) => {
      await this.debitInTx(tx, {
        userId,
        currency: 'G',
        amount: gAmount,
        reason: 'EXCHANGE_G_TO_P',
        refType: 'exchange',
        refId: requestId,
        idempotencyKey: `exchange_g:${userId}:${requestId}`,
      });
      await this.creditInTx(tx, {
        userId,
        currency: 'P',
        amount: pGained,
        reason: 'EXCHANGE_G_TO_P',
        refType: 'exchange',
        refId: requestId,
        idempotencyKey: `exchange_p:${userId}:${requestId}`,
      });
    });

    const [g, p] = await Promise.all([this.getBalance(userId, 'G'), this.getBalance(userId, 'P')]);
    return { g, p, pGained };
  }

  /** 兌換比例：1 G = 10 P（100 G = 1,000 P，規格 §0；搬後台可調為後續增量） */
  static readonly EXCHANGE_P_PER_G = 10;

  private assertPositive(amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('金額必須是正整數');
    }
  }

  /**
   * 交易失敗時，先確認該 idempotencyKey 是否已被（並發的）另一筆處理。
   * 已處理 → 回傳該筆（冪等成功）；否則拋回原錯誤（如真正的餘額不足）。
   * 這同時涵蓋 P2002 唯一鍵衝突與並發 debit 造成的餘額不足兩種情況。
   */
  private async resolveConcurrentDup(idempotencyKey: string, err: unknown): Promise<LedgerEntry> {
    const dup = await this.prisma.ledgerEntry.findUnique({ where: { idempotencyKey } });
    if (dup) return dup;
    throw err;
  }
}
