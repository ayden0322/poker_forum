/**
 * 裝飾商店會員端不變量測試。守住：
 *  - 購買原子性：餘額不足時「不發貨且不扣款」（無付了款沒拿到 / 沒付款卻拿到）
 *  - 冪等 / 防重購：已擁有不重複扣、不重複擁有
 *  - 等級門檻、非販售品擋下
 *  - 裝備：每槽至多 1 件（partial unique）、需擁有、類型相符、可卸下
 *  - 釘選：≤3、主勳章須在釘選內、只能勳章、至多 1 主勳章
 *  - fail-closed：總開關關閉時會員端 API 回 enabled:false
 *
 * 跑法：docker compose run --rm api sh -c "cd apps/api && pnpm test"
 */
import { PrismaClient, Currency, LedgerReason } from '@betting-forum/database';
import { EconomyService } from '../economy/economy.service';
import { CosmeticsService } from './cosmetics.service';
import { CosmeticsController } from './cosmetics.controller';
import type { PrismaService } from '../common/prisma.service';

const prisma = new PrismaClient();
const economy = new EconomyService(prisma as unknown as PrismaService);
const cosmetics = new CosmeticsService(prisma as unknown as PrismaService, economy);

const userIds: string[] = [];
const itemIds: string[] = [];

async function makeUser(level = 1): Promise<string> {
  const u = await prisma.user.create({ data: { nickname: `jest-cos-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, level } });
  userIds.push(u.id);
  return u.id;
}
async function makeItem(data: { type: 'FRAME' | 'BADGE' | 'TITLE'; priceG?: number | null; rarity?: 'COMMON' | 'RARE' | 'LEGENDARY'; iconKey?: string; levelRequired?: number; purchasable?: boolean; enabled?: boolean }): Promise<string> {
  const it = await prisma.cosmeticItem.create({
    data: {
      type: data.type, name: `jest-${data.type}-${Math.random().toString(36).slice(2, 7)}`,
      rarity: data.rarity ?? 'COMMON', priceG: data.priceG === undefined ? 100 : data.priceG,
      iconKey: data.iconKey ?? (data.type === 'BADGE' ? 'star' : null),
      levelRequired: data.levelRequired ?? null,
      purchasable: data.purchasable ?? true, enabled: data.enabled ?? true,
    },
  });
  itemIds.push(it.id);
  return it.id;
}
async function fund(userId: string, amount: number) {
  await economy.credit({ userId, currency: Currency.G, amount, reason: LedgerReason.ADMIN_ADJUST, idempotencyKey: `fund:${userId}:${Math.random()}` });
}

beforeAll(async () => { process.env.MEMBER_ECONOMY_ENABLED = 'true'; await prisma.$connect(); });
afterAll(async () => {
  await prisma.userCosmetic.deleteMany({ where: { userId: { in: userIds } } });
  const accounts = await prisma.walletAccount.findMany({ where: { userId: { in: userIds } } });
  await prisma.ledgerEntry.deleteMany({ where: { accountId: { in: accounts.map((a) => a.id) } } });
  await prisma.walletAccount.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.cosmeticItem.deleteMany({ where: { id: { in: itemIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  delete process.env.MEMBER_ECONOMY_ENABLED;
  await prisma.$disconnect();
});

describe('購買', () => {
  it('成功：扣 G幣 + 取得擁有', async () => {
    const u = await makeUser(); await fund(u, 200);
    const item = await makeItem({ type: 'FRAME', priceG: 150 });
    const r = await cosmetics.purchase(u, item);
    expect(r).toEqual({ ok: true, balanceG: 50 });
    expect(await prisma.userCosmetic.count({ where: { userId: u, itemId: item } })).toBe(1);
  });

  it('防重購 + 冪等：已擁有不重複扣、不重複擁有', async () => {
    const u = await makeUser(); await fund(u, 200);
    const item = await makeItem({ type: 'BADGE', priceG: 100 });
    await cosmetics.purchase(u, item);
    const second = await cosmetics.purchase(u, item);
    expect(second).toEqual({ ok: false, reason: 'already_owned' });
    expect(await economy.getBalance(u, Currency.G)).toBe(100); // 只扣一次
    expect(await prisma.userCosmetic.count({ where: { userId: u, itemId: item } })).toBe(1);
  });

  it('原子性：餘額不足時不發貨、不扣款', async () => {
    const u = await makeUser(); await fund(u, 30);
    const item = await makeItem({ type: 'FRAME', priceG: 100 });
    await expect(cosmetics.purchase(u, item)).rejects.toThrow(); // G幣不足
    expect(await economy.getBalance(u, Currency.G)).toBe(30); // 沒扣
    expect(await prisma.userCosmetic.count({ where: { userId: u, itemId: item } })).toBe(0); // 沒發貨
  });

  it('等級門檻擋下', async () => {
    const u = await makeUser(1); await fund(u, 500);
    const item = await makeItem({ type: 'FRAME', priceG: 100, levelRequired: 3 });
    await expect(cosmetics.purchase(u, item)).rejects.toThrow();
    expect(await prisma.userCosmetic.count({ where: { userId: u, itemId: item } })).toBe(0);
  });

  it('非販售品(priceG null)擋下', async () => {
    const u = await makeUser(); await fund(u, 500);
    const item = await makeItem({ type: 'TITLE', priceG: null });
    await expect(cosmetics.purchase(u, item)).rejects.toThrow();
  });
});

describe('裝備', () => {
  it('框：每槽至多 1 件，換裝會卸下舊的', async () => {
    const u = await makeUser(); await fund(u, 1000);
    const f1 = await makeItem({ type: 'FRAME', priceG: 50 });
    const f2 = await makeItem({ type: 'FRAME', priceG: 50 });
    await cosmetics.purchase(u, f1); await cosmetics.purchase(u, f2);
    await cosmetics.equip(u, 'FRAME', f1);
    await cosmetics.equip(u, 'FRAME', f2);
    const equipped = await prisma.userCosmetic.findMany({ where: { userId: u, equippedSlot: 'FRAME' } });
    expect(equipped).toHaveLength(1);
    expect(equipped[0].itemId).toBe(f2);
    // 卸下
    await cosmetics.equip(u, 'FRAME', null);
    expect(await prisma.userCosmetic.count({ where: { userId: u, equippedSlot: 'FRAME' } })).toBe(0);
  });

  it('未擁有 / 類型不符 擋下', async () => {
    const u = await makeUser(); await fund(u, 500);
    const badge = await makeItem({ type: 'BADGE', priceG: 50 });
    await cosmetics.purchase(u, badge);
    await expect(cosmetics.equip(u, 'FRAME', badge)).rejects.toThrow(); // 類型不符
    const otherFrame = await makeItem({ type: 'FRAME', priceG: 50 });
    await expect(cosmetics.equip(u, 'FRAME', otherFrame)).rejects.toThrow(); // 未擁有
  });
});

describe('釘選勳章', () => {
  it('≤3、主勳章須在釘選內、至多 1 主勳章', async () => {
    const u = await makeUser(); await fund(u, 1000);
    const b = [];
    for (let i = 0; i < 3; i++) { const id = await makeItem({ type: 'BADGE', priceG: 50 }); await cosmetics.purchase(u, id); b.push(id); }
    await cosmetics.pinBadges(u, b, b[0]);
    const pinned = await prisma.userCosmetic.findMany({ where: { userId: u, pinnedOrder: { not: null } } });
    expect(pinned).toHaveLength(3);
    expect(await prisma.userCosmetic.count({ where: { userId: u, isMainBadge: true } })).toBe(1);
    // 重設：只釘 1 枚、換主勳章
    await cosmetics.pinBadges(u, [b[2]], b[2]);
    expect(await prisma.userCosmetic.count({ where: { userId: u, pinnedOrder: { not: null } } })).toBe(1);
    const main = await prisma.userCosmetic.findFirst({ where: { userId: u, isMainBadge: true } });
    expect(main?.itemId).toBe(b[2]);
  });

  it('超過 3 枚 / 主勳章不在釘選內 擋下', async () => {
    const u = await makeUser(); await fund(u, 1000);
    const b = [];
    for (let i = 0; i < 4; i++) { const id = await makeItem({ type: 'BADGE', priceG: 50 }); await cosmetics.purchase(u, id); b.push(id); }
    await expect(cosmetics.pinBadges(u, b)).rejects.toThrow(); // 4 枚
    await expect(cosmetics.pinBadges(u, [b[0]], b[1])).rejects.toThrow(); // main 不在釘選
  });
});

describe('fail-closed', () => {
  it('總開關關閉時會員端 API 回 enabled:false', async () => {
    delete process.env.MEMBER_ECONOMY_ENABLED;
    const ctrl = new CosmeticsController(cosmetics);
    expect(await ctrl.shop({ id: 'x' }, {})).toEqual({ data: { enabled: false, items: [] } });
    expect(await ctrl.inventory({ id: 'x' })).toEqual({ data: { enabled: false, items: [] } });
    expect(await ctrl.purchase({ id: 'x' }, { itemId: 'y' })).toEqual({ data: { enabled: false } });
    process.env.MEMBER_ECONOMY_ENABLED = 'true'; // 還原
  });
});
