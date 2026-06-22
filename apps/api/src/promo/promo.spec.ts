/**
 * 推廣碼「不變量」測試 — 守住歸因與漏斗計數的鐵律。
 *
 *  1. 歸因絕不擋註冊：壞碼/過期/停用/重複一律靜默略過，不丟錯。
 *  2. 一個 user 最多一筆歸因（unique userId，天然冪等）。
 *  3. 點擊去重：同訪客同碼只算一次；bot UA 會被標記（不計入頭條數）。
 *  4. 報表口徑：不重複點擊排除 bot；手機驗證數 = 該區間歸因且 phoneVerified 的人。
 *
 * 跑法（連真實 postgres）：docker compose run --rm api sh -c "cd apps/api && pnpm test"
 */
import { PrismaClient } from '@betting-forum/database';
import { PromoService } from './promo.service';
import type { PrismaService } from '../common/prisma.service';

const prisma = new PrismaClient();
const promo = new PromoService(prisma as unknown as PrismaService);

const userIds: string[] = [];
const partnerIds: string[] = [];
let seq = 0;

async function makeUser(phoneVerified = false): Promise<string> {
  // 暱稱需唯一：用遞增序號 + 隨機碼，避免同毫秒碰撞
  const nickname = `jp${seq++}${Math.random().toString(36).slice(2, 7)}`;
  const u = await prisma.user.create({ data: { nickname, phoneVerified } });
  userIds.push(u.id);
  return u.id;
}

async function makeCode(opts: {
  status?: 'ACTIVE' | 'DISABLED';
  partnerStatus?: 'ACTIVE' | 'DISABLED';
  expiresAt?: Date | null;
} = {}) {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  const partner = await prisma.promoPartner.create({
    data: { name: `jest-partner-${suffix}`, status: opts.partnerStatus ?? 'ACTIVE' },
  });
  partnerIds.push(partner.id);
  const code = await prisma.promoCode.create({
    data: {
      code: `JEST${suffix}`,
      partnerId: partner.id,
      status: opts.status ?? 'ACTIVE',
      expiresAt: opts.expiresAt ?? null,
    },
  });
  return code;
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.promoReferral.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.promoVisit.deleteMany({ where: { code: { partnerId: { in: partnerIds } } } });
  await prisma.promoCode.deleteMany({ where: { partnerId: { in: partnerIds } } });
  await prisma.promoPartner.deleteMany({ where: { id: { in: partnerIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('不變量｜歸因絕不擋註冊', () => {
  it('有效碼 → 建立一筆歸因', async () => {
    const code = await makeCode();
    const userId = await makeUser();
    await promo.attributeRegistration(userId, code.code, 'vid-1', '1.2.3.4');
    const ref = await prisma.promoReferral.findUnique({ where: { userId } });
    expect(ref?.codeId).toBe(code.id);
  });

  it('壞碼 → 無歸因、不丟錯', async () => {
    const userId = await makeUser();
    await expect(promo.attributeRegistration(userId, 'NO_SUCH_CODE', null, null)).resolves.toBeUndefined();
    expect(await prisma.promoReferral.findUnique({ where: { userId } })).toBeNull();
  });

  it('過期碼 → 無歸因', async () => {
    const code = await makeCode({ expiresAt: new Date(Date.now() - 1000) });
    const userId = await makeUser();
    await promo.attributeRegistration(userId, code.code, null, null);
    expect(await prisma.promoReferral.findUnique({ where: { userId } })).toBeNull();
  });

  it('停用碼 / 停用廠商 → 無歸因', async () => {
    const disabledCode = await makeCode({ status: 'DISABLED' });
    const u1 = await makeUser();
    await promo.attributeRegistration(u1, disabledCode.code, null, null);
    expect(await prisma.promoReferral.findUnique({ where: { userId: u1 } })).toBeNull();

    const disabledPartner = await makeCode({ partnerStatus: 'DISABLED' });
    const u2 = await makeUser();
    await promo.attributeRegistration(u2, disabledPartner.code, null, null);
    expect(await prisma.promoReferral.findUnique({ where: { userId: u2 } })).toBeNull();
  });

  it('同 user 重複歸因 → 只留一筆、不丟錯（冪等）', async () => {
    const code = await makeCode();
    const userId = await makeUser();
    await promo.attributeRegistration(userId, code.code, null, null);
    await promo.attributeRegistration(userId, code.code, null, null);
    const count = await prisma.promoReferral.count({ where: { userId } });
    expect(count).toBe(1);
  });

  it('碼大小寫不敏感（落地與註冊可能不同大小寫）', async () => {
    const code = await makeCode();
    const userId = await makeUser();
    await promo.attributeRegistration(userId, code.code.toLowerCase(), null, null);
    expect(await prisma.promoReferral.findUnique({ where: { userId } })).not.toBeNull();
  });
});

describe('不變量｜點擊去重與 bot 標記', () => {
  it('同訪客同碼點兩次 → 只一筆', async () => {
    const code = await makeCode();
    await promo.trackVisit(code.code, 'visitor-A', '1.1.1.1', 'Mozilla/5.0');
    await promo.trackVisit(code.code, 'visitor-A', '1.1.1.1', 'Mozilla/5.0');
    const n = await prisma.promoVisit.count({ where: { codeId: code.id } });
    expect(n).toBe(1);
  });

  it('bot UA → isBot=true；一般 UA → false', async () => {
    const code = await makeCode();
    await promo.trackVisit(code.code, 'bot-v', '2.2.2.2', 'Googlebot/2.1');
    await promo.trackVisit(code.code, 'human-v', '3.3.3.3', 'Mozilla/5.0 (iPhone)');
    const bot = await prisma.promoVisit.findUnique({ where: { codeId_visitorId: { codeId: code.id, visitorId: 'bot-v' } } });
    const human = await prisma.promoVisit.findUnique({ where: { codeId_visitorId: { codeId: code.id, visitorId: 'human-v' } } });
    expect(bot?.isBot).toBe(true);
    expect(human?.isBot).toBe(false);
  });

  it('無效碼點擊 → 回 false、不留資料、不丟錯', async () => {
    await expect(promo.trackVisit('NOPE', 'v', undefined, 'UA')).resolves.toBe(false);
  });

  it('有效碼點擊 → 回 true（落地頁據此決定是否覆寫歸因 cookie）', async () => {
    const code = await makeCode();
    await expect(promo.trackVisit(code.code, 'valid-vid', '9.9.9.9', 'Mozilla/5.0')).resolves.toBe(true);
  });
});

describe('報表口徑｜點擊排除 bot、驗證數只算 phoneVerified', () => {
  it('visits 排除 bot；verified 只算手機驗證者', async () => {
    const code = await makeCode();
    // 兩次點擊：一真一 bot
    await promo.trackVisit(code.code, 'rv-human', '4.4.4.4', 'Mozilla/5.0');
    await promo.trackVisit(code.code, 'rv-bot', '5.5.5.5', 'crawler-bot');
    // 兩個註冊：一個已驗手機、一個未驗
    const verifiedUser = await makeUser(true);
    const plainUser = await makeUser(false);
    await promo.attributeRegistration(verifiedUser, code.code, 'rv-human', '4.4.4.4');
    await promo.attributeRegistration(plainUser, code.code, null, null);

    const report = await promo.report(undefined, undefined, code.partnerId);
    const row = report.codes.find((c) => c.codeId === code.id)!;
    expect(row.visits).toBe(1); // bot 不計
    expect(row.registrations).toBe(2);
    expect(row.verified).toBe(1); // 只算 phoneVerified
  });
});
