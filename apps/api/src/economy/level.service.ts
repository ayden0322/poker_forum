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

/** 等級 + 經驗進度總覽（唯讀，給前端顯示） */
export interface LevelSummary {
  exp: number;
  level: number;
  /** 等級名稱；對應 tier，未知等級 fallback '會員' */
  levelName: string;
  /** 下一個「經驗門檻」等級；已達經驗階梯頂(Lv4)、邀請制(Lv5)、或未知等級 → null */
  nextLevel: { level: number; name: string; minExp: number } | null;
  /** 目前等級門檻起算已累積經驗（無經驗門檻的等級為 0） */
  expIntoCurrent: number;
  /** 升到下一級需要的經驗跨距；無下一級 → null */
  expForNext: number | null;
  /** 升級進度 0~100；Lv4 滿階梯=100；邀請制/未知等級=null */
  progressPct: number | null;
}

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

  /**
   * 等級 + 經驗進度總覽（唯讀）。
   * level 取自 User.level（權威，邀請制 Lv5 不被經驗動）；其餘由 tiers 推算。
   * 處理邊界：邀請制 Lv5(minExp=null)、Lv4 已達經驗階梯頂、舊資料未知等級(如 level=6)。
   */
  async getSummary(userId: string): Promise<LevelSummary> {
    const [exp, tiers, user] = await Promise.all([
      this.getExp(userId),
      this.getTiers(),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { level: true } }),
    ]);

    const level = user.level;
    const currentTier = tiers.find((t) => t.level === level);
    const levelName = currentTier?.name ?? '會員'; // 未知等級 fallback（#4）
    const currentMinExp = currentTier?.minExp ?? null; // 邀請制/未知 → null

    // 有經驗門檻、且級數更高的下一個 tier（邀請制 Lv5 minExp=null 不會入列）
    const nextTier =
      tiers
        .filter((t): t is typeof t & { minExp: number } => t.minExp != null && t.level > level)
        .sort((a, b) => a.minExp - b.minExp)[0] ?? null;

    const nextLevel = nextTier
      ? { level: nextTier.level, name: nextTier.name, minExp: nextTier.minExp }
      : null;

    if (nextLevel && currentMinExp != null) {
      // 一般情況：算目前級門檻 → 下一級門檻 的進度
      const span = nextLevel.minExp - currentMinExp;
      const into = Math.max(0, exp - currentMinExp);
      const progressPct = span > 0 ? Math.min(100, Math.round((into / span) * 100)) : 0;
      return { exp, level, levelName, nextLevel, expIntoCurrent: into, expForNext: span, progressPct };
    }

    if (currentMinExp != null) {
      // 有經驗門檻但沒有更高門檻（已達經驗階梯頂，如 Lv4）→ 進度滿（#5）
      return {
        exp, level, levelName, nextLevel: null,
        expIntoCurrent: Math.max(0, exp - currentMinExp), expForNext: null, progressPct: 100,
      };
    }

    // 邀請制 Lv5 或未知等級：無法算經驗進度（#6）
    return { exp, level, levelName, nextLevel: null, expIntoCurrent: 0, expForNext: null, progressPct: null };
  }
}
