/**
 * 會員經濟「不變量」測試 — 守住跨 session 不可被打破的鐵律。
 * 這些是文件會說謊、但測試不會的東西；未來任何人（含 AI）改 economy 時，
 * 打破其中之一就會紅燈，而不是等使用者或 code review 用眼睛抓。
 *
 *  1. 法遵紅線：貨幣與帳本理由不得出現「真錢儲值/提現」概念
 *     （純虛擬經濟，G/P 幣不可儲值真錢、不可提現，台灣法律紅線）
 *  2. 防刷：瀏覽任務必須驗證文章存在；同 refId 當日去重
 *  3. fail-closed：總開關關閉時，發幣與讀取 API 一律不啟用、不洩資料
 *
 * 跑法：docker compose run --rm api sh -c "cd apps/api && pnpm test"
 */
import { PrismaClient, Currency, LedgerReason, DailyTaskKey } from '@betting-forum/database';
import { EconomyService } from './economy.service';
import { LevelService } from './level.service';
import { TasksService } from '../tasks/tasks.service';
import { isMemberEconomyEnabled } from './economy.flags';
import { MemberController } from '../member/member.controller';
import { PostsController } from '../posts/posts.controller';
import type { PrismaService } from '../common/prisma.service';

const prisma = new PrismaClient();
const economy = new EconomyService(prisma as unknown as PrismaService);
const level = new LevelService(prisma as unknown as PrismaService, economy);
const tasks = new TasksService(prisma as unknown as PrismaService, economy, level);

const createdUserIds: string[] = [];
const createdPostIds: string[] = [];
async function makeUser(): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const u = await prisma.user.create({ data: { nickname: `jest-inv-${suffix}` } });
  createdUserIds.push(u.id);
  return u.id;
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.taskEventLog.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.post.deleteMany({ where: { id: { in: createdPostIds } } });
  await prisma.dailyTaskProgress.deleteMany({ where: { userId: { in: createdUserIds } } });
  const accounts = await prisma.walletAccount.findMany({ where: { userId: { in: createdUserIds } } });
  await prisma.ledgerEntry.deleteMany({ where: { accountId: { in: accounts.map((a) => a.id) } } });
  await prisma.walletAccount.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

// ──────────────────────────────────────────────────────────────
// 不變量 1：法遵紅線（純單元，不需 DB）
// ──────────────────────────────────────────────────────────────
describe('不變量｜法遵：純虛擬經濟，不存在真錢路徑', () => {
  // 任何疑似「真錢進出 / 串接金流」的字眼都不該出現在貨幣或帳本理由。
  // 含常見金流商名（ECPay 綠界、SmilePay、Stripe、PayPal）當更強的 tripwire。
  const MONEY =
    /topup|top_up|deposit|recharge|withdraw|cashout|cash_out|payout_real|fiat|ecpay|smilepay|stripe|paypal|提現|儲值|入金|出金|充值|綠界|金流|信用卡|新台幣/i;

  it('Currency 僅限虛擬幣別 {G, P, EXP}', () => {
    expect(new Set<string>(Object.values(Currency))).toEqual(new Set(['G', 'P', 'EXP']));
  });

  it('LedgerReason 不得含任何真錢儲值/提現概念', () => {
    for (const r of Object.values(LedgerReason)) {
      expect(r).not.toMatch(MONEY);
    }
  });

  it('LedgerReason 必須在已知虛擬白名單內（要新增理由＝必須有意識改這個測試）', () => {
    const ALLOWED = new Set([
      'TASK_REWARD', 'SHOP_PURCHASE', 'SHOP_REFUND', 'EXCHANGE_G_TO_P',
      'PREDICTION_STAKE', 'PREDICTION_PAYOUT', 'PREDICTION_REFUND',
      // 2026-07-07 P幣競猜二期：結算沖正（比分改判時另記更正，不 UPDATE 舊帳）——純虛擬，無真錢路徑
      'PREDICTION_REVERSAL',
      'ADMIN_ADJUST',
    ]);
    for (const r of Object.values(LedgerReason)) {
      expect(ALLOWED.has(r)).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────
// 不變量 2：防刷
// ──────────────────────────────────────────────────────────────
describe('不變量｜防刷', () => {
  beforeAll(() => { process.env.MEMBER_ECONOMY_ENABLED = 'true'; });
  afterAll(() => { delete process.env.MEMBER_ECONOMY_ENABLED; });

  it('瀏覽任務：捏造不存在的文章 id 不計事件、不發獎', async () => {
    const userId = await makeUser();
    const ctrl = new PostsController({} as never, prisma as unknown as PrismaService, tasks);
    const spy = jest.spyOn(tasks, 'recordEvent');
    const res = await ctrl.recordView('definitely-not-a-real-post-id', { id: userId });
    expect(res).toEqual({ data: { ok: false } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('瀏覽任務：真實存在的文章才會記事件', async () => {
    // 自建一篇文章，確保此案例一定有斷言、不會因 DB 無文章而假綠燈
    const board = await prisma.board.findFirst({ select: { id: true } });
    if (!board) throw new Error('測試前置失敗：需至少一個看板');
    const authorId = await makeUser();
    const post = await prisma.post.create({
      data: { title: 'inv-view-test', content: 'x', boardId: board.id, authorId, status: 'PUBLISHED' },
    });
    createdPostIds.push(post.id);

    const userId = await makeUser();
    const ctrl = new PostsController({} as never, prisma as unknown as PrismaService, tasks);
    const res = await ctrl.recordView(post.id, { id: userId });
    expect(res).toEqual({ data: { ok: true } });
    expect(await prisma.taskEventLog.count({ where: { userId, taskKey: DailyTaskKey.VIEW_POSTS } })).toBe(1);
  });

  it('去重：同一 refId 當日重複只計一次（按讚同篇 5 次不達門檻、不發幣）', async () => {
    const userId = await makeUser();
    for (let i = 0; i < 5; i++) await tasks.recordEvent(userId, DailyTaskKey.LIKE, 'same-post-id');
    expect(await economy.getBalance(userId, Currency.G)).toBe(0);
    expect(await prisma.taskEventLog.count({ where: { userId, taskKey: DailyTaskKey.LIKE } })).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────
// 不變量 3：fail-closed 總開關
// ──────────────────────────────────────────────────────────────
describe('不變量｜fail-closed：總開關', () => {
  const orig = process.env.MEMBER_ECONOMY_ENABLED;
  afterEach(() => {
    if (orig === undefined) delete process.env.MEMBER_ECONOMY_ENABLED;
    else process.env.MEMBER_ECONOMY_ENABLED = orig;
  });

  it('只有字串 "true" 啟用，其餘（空/false/TRUE/1/未設）一律關', () => {
    for (const v of ['', 'false', 'TRUE', '1', 'yes']) {
      process.env.MEMBER_ECONOMY_ENABLED = v;
      expect(isMemberEconomyEnabled()).toBe(false);
    }
    delete process.env.MEMBER_ECONOMY_ENABLED;
    expect(isMemberEconomyEnabled()).toBe(false);
    process.env.MEMBER_ECONOMY_ENABLED = 'true';
    expect(isMemberEconomyEnabled()).toBe(true);
  });

  it('關閉時 recordEvent 完全 no-op：不記事件、不發幣', async () => {
    delete process.env.MEMBER_ECONOMY_ENABLED;
    const userId = await makeUser();
    await tasks.recordEvent(userId, DailyTaskKey.LOGIN, 'login');
    expect(await economy.getBalance(userId, Currency.G)).toBe(0);
    expect(await prisma.taskEventLog.count({ where: { userId } })).toBe(0);
  });

  it('關閉時 completeTask 也被擋（防直接呼叫繞過總開關）', async () => {
    delete process.env.MEMBER_ECONOMY_ENABLED;
    const userId = await makeUser();
    const res = await tasks.completeTask(userId, DailyTaskKey.LOGIN);
    expect(res).toEqual({ ok: false, reason: 'economy_disabled' });
    expect(await economy.getBalance(userId, Currency.G)).toBe(0);
  });

  it('關閉時 member 讀取 API 回 enabled:false，不洩餘額/等級/任務', async () => {
    delete process.env.MEMBER_ECONOMY_ENABLED;
    const ctrl = new MemberController(economy, level, tasks);
    expect(await ctrl.me({ id: 'anyone' })).toEqual({ data: { enabled: false } });
    expect(await ctrl.tasksToday({ id: 'anyone' })).toEqual({ data: { enabled: false, tasks: [] } });
  });
});
