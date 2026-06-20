import { Injectable, Logger } from '@nestjs/common';
import { Currency, DailyTaskDef, DailyTaskKey, LedgerReason, Prisma } from '@betting-forum/database';
import { PrismaService } from '../common/prisma.service';
import { EconomyService } from '../economy/economy.service';
import { LevelService } from '../economy/level.service';
import { isMemberEconomyEnabled } from '../economy/economy.flags';

/** 每日任務預設（任務「類型」綁程式，獎勵/門檻數值可後台覆蓋；後台 CRUD 為 #5） */
export const DEFAULT_DAILY_TASKS: { taskKey: DailyTaskKey; label: string; rewardG: number; rewardExp: number; threshold: number }[] = [
  { taskKey: 'LOGIN', label: '每日登入', rewardG: 10, rewardExp: 10, threshold: 1 },
  { taskKey: 'VIEW_POSTS', label: '瀏覽 5 篇文章', rewardG: 5, rewardExp: 5, threshold: 5 },
  { taskKey: 'CREATE_POST', label: '發表 1 篇文章', rewardG: 20, rewardExp: 20, threshold: 1 },
  { taskKey: 'REPLY', label: '回覆 3 篇文章', rewardG: 10, rewardExp: 10, threshold: 3 },
  { taskKey: 'LIKE', label: '按讚 5 次', rewardG: 5, rewardExp: 5, threshold: 5 },
];

/** LOGIN 這種「無自然對象」任務的固定 refId（一天一次） */
export const LOGIN_REF = 'login';

/** 每日上限（之後 #6 改為依等級可調） */
export const DAILY_G_CAP = 50;
export const DAILY_EXP_CAP = 50;

export type CompleteResult =
  | { ok: true; granted: { g: number; exp: number } }
  | { ok: false; reason: 'already_done' | 'disabled' | 'unknown_task' };

/** 台灣今日 YYYY-MM-DD（en-CA 格式即 YYYY-MM-DD） */
export function twToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now);
}

/** 台灣某日 00:00 對應的 UTC 瞬間（用來篩當日帳本） */
export function twDayStartUtc(twDate: string): Date {
  return new Date(`${twDate}T00:00:00+08:00`);
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
    private readonly level: LevelService,
  ) {}

  /**
   * 真實事件入口：登入/瀏覽/發文/回覆/按讚 成功後呼叫。
   *  - 單一 fail-closed 總開關：未啟用直接 no-op（schema 上 prod 也不發幣）
   *  - 去重計數：同 refId 當日只計一次（瀏覽同篇 5 次不算 5）
   *  - 達門檻才 completeTask 發獎
   *  - 永不丟錯：發獎失敗不可拖垮主流程（發文/登入照樣成功）
   *  - 只認「當下」事件，不回溯歷史（開關打開後才開始累積）
   */
  async recordEvent(userId: string, taskKey: DailyTaskKey, refId: string): Promise<void> {
    if (!isMemberEconomyEnabled()) return; // 總開關（fail-closed）
    try {
      const today = twToday();
      const defs = await this.getTaskDefs();
      const def = defs.find((d) => d.taskKey === taskKey);
      if (!def || !def.enabled) return;

      // 記一次不同 refId 的事件（同 refId 當日重複→唯一鍵擋下、不重複計）
      try {
        await this.prisma.taskEventLog.create({ data: { userId, taskKey, refId, taskDate: today } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return;
        throw e;
      }

      // 當日不同 refId 數達門檻 → 發獎（completeTask 本身去重+冪等）
      const count = await this.prisma.taskEventLog.count({ where: { userId, taskKey, taskDate: today } });
      if (count >= def.threshold) {
        await this.completeTask(userId, taskKey);
      }
    } catch (e) {
      this.logger.warn(`recordEvent 失敗（不影響主流程）：${taskKey}/${userId}: ${String(e)}`);
    }
  }

  /** 取得任務定義（首次自動 seed 程式預設） */
  async getTaskDefs(): Promise<DailyTaskDef[]> {
    const count = await this.prisma.dailyTaskDef.count();
    if (count === 0) {
      await this.prisma.dailyTaskDef.createMany({ data: DEFAULT_DAILY_TASKS, skipDuplicates: true });
    }
    return this.prisma.dailyTaskDef.findMany();
  }

  /** 今日經由任務發放的某幣別總額（用帳本實際發放算，最準） */
  private async grantedToday(userId: string, currency: Currency, twDate: string): Promise<number> {
    const agg = await this.prisma.ledgerEntry.aggregate({
      where: {
        account: { userId, currency },
        reason: LedgerReason.TASK_REWARD,
        createdAt: { gte: twDayStartUtc(twDate) },
      },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  }

  /**
   * 完成某每日任務並發獎。規則引擎核心：
   *  - 一天一次（DailyTaskProgress 去重）
   *  - 每日 G/經驗上限（發到剛好上限為止）
   *  - 發獎冪等（沿用帳本 idempotencyKey）
   *
   * 注意：此方法代表「這個任務已達成、請發獎」，不檢查達成門檻
   *      （瀏覽 5 篇等計數由 #4 接事件時處理）。
   */
  async completeTask(userId: string, taskKey: DailyTaskKey): Promise<CompleteResult> {
    const today = twToday();
    const defs = await this.getTaskDefs();
    const def = defs.find((d) => d.taskKey === taskKey);
    if (!def) return { ok: false, reason: 'unknown_task' };
    if (!def.enabled) return { ok: false, reason: 'disabled' };

    // 今日已完成？
    const existing = await this.prisma.dailyTaskProgress.findUnique({
      where: { userId_taskKey_taskDate: { userId, taskKey, taskDate: today } },
    });
    if (existing) return { ok: false, reason: 'already_done' };

    // 每日上限：用帳本實際發放算今日已發，發到剛好上限為止
    const [grantedG, grantedExp] = await Promise.all([
      this.grantedToday(userId, Currency.G, today),
      this.grantedToday(userId, Currency.EXP, today),
    ]);
    const giveG = Math.max(0, Math.min(def.rewardG, DAILY_G_CAP - grantedG));
    const giveExp = Math.max(0, Math.min(def.rewardExp, DAILY_EXP_CAP - grantedExp));

    const base = `task:${userId}:${taskKey}:${today}`;
    if (giveG > 0) {
      await this.economy.credit({
        userId, currency: Currency.G, amount: giveG,
        reason: LedgerReason.TASK_REWARD, refType: 'task', refId: taskKey,
        idempotencyKey: `${base}:G`,
      });
    }
    if (giveExp > 0) {
      await this.level.addExp({
        userId, amount: giveExp,
        reason: LedgerReason.TASK_REWARD, refType: 'task', refId: taskKey,
        idempotencyKey: `${base}:EXP`,
      });
    }

    // 記錄完成（並發重複由 unique 擋下，grants 已冪等故安全忽略）
    try {
      await this.prisma.dailyTaskProgress.create({ data: { userId, taskKey, taskDate: today } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }

    return { ok: true, granted: { g: giveG, exp: giveExp } };
  }
}
