/**
 * 每日任務規則引擎測試。守住：
 *  1. 一天一次去重：同任務當日第二次不發
 *  2. 每日上限：完成全部剛好 50，不超過
 *  3. 封頂部分發放：超過上限的任務只發到剛好 50
 *  4. 台灣日界：昨日的完成紀錄不擋今日
 *  5. twDayStartUtc：台灣日 → 正確 UTC 視窗
 *
 * 跑法：docker compose run --rm api sh -c "cd apps/api && pnpm test"
 */
import { PrismaClient, Currency, DailyTaskKey } from '@betting-forum/database';
import { EconomyService } from '../economy/economy.service';
import { LevelService } from '../economy/level.service';
import { TasksService, twToday, twDayStartUtc, DEFAULT_DAILY_TASKS } from './tasks.service';
import type { PrismaService } from '../common/prisma.service';

const prisma = new PrismaClient();
const economy = new EconomyService(prisma as unknown as PrismaService);
const level = new LevelService(prisma as unknown as PrismaService, economy);
const tasks = new TasksService(prisma as unknown as PrismaService, economy, level);

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const u = await prisma.user.create({ data: { nickname: `jest-task-${suffix}` } });
  createdUserIds.push(u.id);
  return u.id;
}

async function restoreTaskDefs() {
  for (const d of DEFAULT_DAILY_TASKS) {
    await prisma.dailyTaskDef.update({
      where: { taskKey: d.taskKey },
      data: { rewardG: d.rewardG, rewardExp: d.rewardExp, threshold: d.threshold, enabled: true },
    });
  }
}

beforeAll(async () => {
  process.env.MEMBER_ECONOMY_ENABLED = 'true'; // recordEvent 需總開關開啟
  await prisma.$connect();
  await tasks.getTaskDefs(); // 確保 defs 已 seed
});

afterAll(async () => {
  await prisma.taskEventLog.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.dailyTaskProgress.deleteMany({ where: { userId: { in: createdUserIds } } });
  const accounts = await prisma.walletAccount.findMany({ where: { userId: { in: createdUserIds } } });
  await prisma.ledgerEntry.deleteMany({ where: { accountId: { in: accounts.map((a) => a.id) } } });
  await prisma.walletAccount.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await restoreTaskDefs(); // 還原被測試改過的數值
  delete process.env.MEMBER_ECONOMY_ENABLED;
  await prisma.$disconnect();
});

describe('twDayStartUtc', () => {
  it('台灣日 00:00 = 前一日 16:00 UTC', () => {
    expect(twDayStartUtc('2026-06-08').toISOString()).toBe('2026-06-07T16:00:00.000Z');
  });
});

describe('TasksService.completeTask', () => {
  it('一天一次：完成 LOGIN 發 10/10；第二次 already_done、餘額不變', async () => {
    const userId = await makeUser();
    const r1 = await tasks.completeTask(userId, DailyTaskKey.LOGIN);
    expect(r1).toEqual({ ok: true, granted: { g: 10, exp: 10 } });
    expect(await economy.getBalance(userId, Currency.G)).toBe(10);
    expect(await economy.getBalance(userId, Currency.EXP)).toBe(10);

    const r2 = await tasks.completeTask(userId, DailyTaskKey.LOGIN);
    expect(r2).toEqual({ ok: false, reason: 'already_done' });
    expect(await economy.getBalance(userId, Currency.G)).toBe(10);
  });

  it('每日上限：完成全部任務 → 剛好 50 G / 50 經驗', async () => {
    const userId = await makeUser();
    for (const d of DEFAULT_DAILY_TASKS) {
      await tasks.completeTask(userId, d.taskKey);
    }
    expect(await economy.getBalance(userId, Currency.G)).toBe(50);
    expect(await economy.getBalance(userId, Currency.EXP)).toBe(50);
  });

  it('封頂部分發放：LOGIN 調 45 後完成，再完成 REPLY(10) 只發到 50', async () => {
    await prisma.dailyTaskDef.update({ where: { taskKey: DailyTaskKey.LOGIN }, data: { rewardG: 45, rewardExp: 45 } });
    const userId = await makeUser();

    const r1 = await tasks.completeTask(userId, DailyTaskKey.LOGIN);
    expect(r1).toEqual({ ok: true, granted: { g: 45, exp: 45 } });

    const r2 = await tasks.completeTask(userId, DailyTaskKey.REPLY); // 預設 10，但只剩 5 額度
    expect(r2).toEqual({ ok: true, granted: { g: 5, exp: 5 } });

    expect(await economy.getBalance(userId, Currency.G)).toBe(50);
    expect(await economy.getBalance(userId, Currency.EXP)).toBe(50);

    await restoreTaskDefs();
  });

  it('台灣日界：昨日完成紀錄不擋今日', async () => {
    const userId = await makeUser();
    const today = twToday();
    const yesterday = twToday(new Date(twDayStartUtc(today).getTime() - 1000)); // 今日 00:00(台灣) 前 1 秒 = 昨日
    // 直接塞一筆昨日的 LOGIN 完成紀錄
    await prisma.dailyTaskProgress.create({ data: { userId, taskKey: DailyTaskKey.LOGIN, taskDate: yesterday } });

    const r = await tasks.completeTask(userId, DailyTaskKey.LOGIN);
    expect(r.ok).toBe(true);
    expect(await economy.getBalance(userId, Currency.G)).toBe(10);
  });
});

describe('TasksService.recordEvent', () => {
  it('門檻>1（LIKE=5）：5 篇不同 → 發獎；不足門檻不發', async () => {
    const userId = await makeUser();
    // 先 4 篇 → 未達門檻、不發
    for (let i = 0; i < 4; i++) await tasks.recordEvent(userId, DailyTaskKey.LIKE, `post-${i}`);
    expect(await economy.getBalance(userId, Currency.G)).toBe(0);
    // 第 5 篇 → 達門檻、發 5/5
    await tasks.recordEvent(userId, DailyTaskKey.LIKE, 'post-4');
    expect(await economy.getBalance(userId, Currency.G)).toBe(5);
    expect(await economy.getBalance(userId, Currency.EXP)).toBe(5);
  });

  it('去重計數：同一 refId 重複不算數', async () => {
    const userId = await makeUser();
    for (let i = 0; i < 5; i++) await tasks.recordEvent(userId, DailyTaskKey.LIKE, 'same-post'); // 同篇 5 次
    expect(await economy.getBalance(userId, Currency.G)).toBe(0); // 只算 1 次、未達 5
  });

  it('門檻=1（LOGIN）：記一次即發獎', async () => {
    const userId = await makeUser();
    await tasks.recordEvent(userId, DailyTaskKey.LOGIN, 'login');
    expect(await economy.getBalance(userId, Currency.G)).toBe(10);
  });

  it('總開關關閉：recordEvent 完全不動作', async () => {
    const userId = await makeUser();
    process.env.MEMBER_ECONOMY_ENABLED = 'false';
    await tasks.recordEvent(userId, DailyTaskKey.LOGIN, 'login');
    expect(await economy.getBalance(userId, Currency.G)).toBe(0);
    // 連事件都不該記
    expect(await prisma.taskEventLog.count({ where: { userId } })).toBe(0);
    process.env.MEMBER_ECONOMY_ENABLED = 'true'; // 還原給後續測試
  });
});
