/**
 * 等級系統測試（沿用 #1 帳本機制；EXP 為帳本第三種幣別）。
 * 守住：
 *  1. levelForExp 純函式：門檻邊界正確、永不算到邀請制 Lv5
 *  2. addExp 真的加經驗並升等
 *  3. 經驗門檻臨界（999 仍 Lv1、1000 進 Lv2）
 *  4. addExp 冪等：同 key 重送不重複加經驗、不重複升等
 *  5. Lv5 名人堂不被經驗重算降級
 *
 * 跑法：docker compose run --rm api sh -c "cd apps/api && pnpm test"
 */
import { PrismaClient, Currency } from '@betting-forum/database';
import { EconomyService } from './economy.service';
import { LevelService, levelForExp, DEFAULT_LEVEL_TIERS } from './level.service';
import type { PrismaService } from '../common/prisma.service';

const prisma = new PrismaClient();
const economy = new EconomyService(prisma as unknown as PrismaService);
const level = new LevelService(prisma as unknown as PrismaService, economy);

const createdUserIds: string[] = [];

async function makeUser(initialLevel = 1): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const u = await prisma.user.create({ data: { nickname: `jest-lvl-${suffix}`, level: initialLevel } });
  createdUserIds.push(u.id);
  return u.id;
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  const accounts = await prisma.walletAccount.findMany({ where: { userId: { in: createdUserIds } } });
  await prisma.ledgerEntry.deleteMany({ where: { accountId: { in: accounts.map((a) => a.id) } } });
  await prisma.walletAccount.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

describe('levelForExp 純函式', () => {
  const tiers = DEFAULT_LEVEL_TIERS;
  it.each([
    [0, 1],
    [999, 1],
    [1000, 2],
    [2999, 2],
    [3000, 3],
    [9999, 3],
    [10000, 4],
    [999999, 4], // 經驗再高也只到 Lv4，Lv5 是邀請制
  ])('exp=%i → Lv%i', (exp, expected) => {
    expect(levelForExp(exp, tiers)).toBe(expected);
  });
});

describe('LevelService.addExp', () => {
  it('加經驗並升等：0 → +1000 → Lv2、exp=1000', async () => {
    const userId = await makeUser();
    const res = await level.addExp({ userId, amount: 1000, idempotencyKey: `lvl-up-${userId}` });
    expect(res.exp).toBe(1000);
    expect(res.level).toBe(2);
    expect(res.leveledUp).toBe(true);
    expect(await economy.getBalance(userId, Currency.EXP)).toBe(1000);
  });

  it('門檻臨界：999 仍 Lv1、再 +1 進 Lv2', async () => {
    const userId = await makeUser();
    const r1 = await level.addExp({ userId, amount: 999, idempotencyKey: `edge-a-${userId}` });
    expect(r1.exp).toBe(999);
    expect(r1.level).toBe(1);

    const r2 = await level.addExp({ userId, amount: 1, idempotencyKey: `edge-b-${userId}` });
    expect(r2.exp).toBe(1000);
    expect(r2.level).toBe(2);
  });

  it('冪等：同 key 重送不重複加經驗、不重複升等', async () => {
    const userId = await makeUser();
    const key = `idem-${userId}`;
    await level.addExp({ userId, amount: 1000, idempotencyKey: key });
    const again = await level.addExp({ userId, amount: 1000, idempotencyKey: key });
    expect(again.exp).toBe(1000); // 不是 2000
    expect(again.level).toBe(2);
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { level: true } });
    expect(dbUser.level).toBe(2);
  });

  it('Lv5 名人堂：再加爆量經驗也不被重算降級', async () => {
    const userId = await makeUser(5);
    const res = await level.addExp({ userId, amount: 999999, idempotencyKey: `hof-${userId}` });
    expect(res.level).toBe(5);
    expect(res.leveledUp).toBe(false);
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { level: true } });
    expect(dbUser.level).toBe(5);
  });
});
