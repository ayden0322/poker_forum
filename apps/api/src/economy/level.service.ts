import { Injectable } from '@nestjs/common';
import { Currency, LedgerReason, LevelTier } from '@betting-forum/database';
import { PrismaService } from '../common/prisma.service';
import { EconomyService } from './economy.service';

/**
 * 等級門檻預設值（程式定義「旋鈕」，可被 DB level_tiers 覆蓋；後台 CRUD 頁為後續增量）。
 * minExp = null 代表非經驗門檻（邀請制，如 Lv5 名人堂），不會被經驗自動升上去。
 */
export const DEFAULT_LEVEL_TIERS: { level: number; name: string; minExp: number | null }[] = [
  { level: 1, name: '新手', minExp: 0 },
  { level: 2, name: '球探', minExp: 1000 },
  { level: 3, name: '分析師', minExp: 3000 },
  { level: 4, name: '專家', minExp: 10000 },
  { level: 5, name: '名人堂', minExp: null }, // 邀請制，不由經驗自動升上
];

/** 邀請制等級（不被經驗重算改動） */
const INVITE_ONLY_LEVEL = 5;

/** 依經驗值算等級：只看有 minExp 的門檻，取符合的最高級（Lv5 不在此列）。 */
export function levelForExp(
  exp: number,
  tiers: { level: number; minExp: number | null }[],
): number {
  const gated = tiers
    .filter((t): t is { level: number; minExp: number } => t.minExp != null)
    .sort((a, b) => a.minExp - b.minExp);
  let level = gated[0]?.level ?? 1;
  for (const t of gated) {
    if (exp >= t.minExp) level = t.level;
  }
  return level;
}

@Injectable()
export class LevelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
  ) {}

  /** 取得等級門檻（首次自動 seed 程式預設值；skipDuplicates 防並發重複 seed） */
  async getTiers(): Promise<LevelTier[]> {
    const count = await this.prisma.levelTier.count();
    if (count === 0) {
      await this.prisma.levelTier.createMany({ data: DEFAULT_LEVEL_TIERS, skipDuplicates: true });
    }
    return this.prisma.levelTier.findMany({ orderBy: { level: 'asc' } });
  }

  /** 使用者目前經驗值（= EXP 帳本餘額） */
  getExp(userId: string): Promise<number> {
    return this.economy.getBalance(userId, Currency.EXP);
  }

  /**
   * 加經驗 + 重算等級。冪等（沿用帳本 idempotencyKey）。
   * - 經驗只增不減，沿用 #1 帳本的 append-only 與防重複保證。
   * - 邀請制等級（Lv5）不被經驗重算改動。
   */
  async addExp(params: {
    userId: string;
    amount: number;
    reason?: LedgerReason;
    refType?: string;
    refId?: string;
    idempotencyKey: string;
  }): Promise<{ exp: number; level: number; leveledUp: boolean }> {
    // 1. 加經驗（冪等，沿用帳本）
    await this.economy.credit({
      userId: params.userId,
      currency: Currency.EXP,
      amount: params.amount,
      reason: params.reason ?? LedgerReason.TASK_REWARD,
      refType: params.refType,
      refId: params.refId,
      idempotencyKey: params.idempotencyKey,
    });

    // 2. 重算等級
    const [exp, tiers, user] = await Promise.all([
      this.getExp(params.userId),
      this.getTiers(),
      this.prisma.user.findUniqueOrThrow({ where: { id: params.userId }, select: { level: true } }),
    ]);

    if (user.level === INVITE_ONLY_LEVEL) {
      return { exp, level: user.level, leveledUp: false }; // 名人堂不動
    }

    const computed = levelForExp(exp, tiers);
    if (computed === user.level) {
      return { exp, level: user.level, leveledUp: false };
    }
    await this.prisma.user.update({ where: { id: params.userId }, data: { level: computed } });
    return { exp, level: computed, leveledUp: computed > user.level };
  }
}
