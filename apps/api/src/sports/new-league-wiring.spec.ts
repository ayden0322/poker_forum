// 新增聯賽（亞洲盃 2026-10-01）兩個接線點的回歸測試：
//   1. 後台 ensureDefaults 只補缺、不覆蓋——舊版只在 DB 全空時才寫，新聯賽永遠進不了 DB，
//      translation.cron 就不會替它翻隊名；但也絕不能蓋掉後台改過的賽季/競猜開關
//   2. 國家隊譯名存在 entityType='country'，通用足球路徑要查得到；同 id 有 'team' 時以 'team' 為準

import { AdminSportsConfigController } from '../admin/sports-config.controller';
import { SportsService } from './sports.service';
import { LEAGUE_CONFIG } from './sports.config';

describe('AdminSportsConfigController.ensureDefaults 只補缺不覆蓋', () => {
  function make(existingSlugs: string[]) {
    const prisma = {
      sportsConfig: {
        findMany: jest.fn().mockResolvedValue(existingSlugs.map((boardSlug) => ({ boardSlug }))),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctrl = new AdminSportsConfigController(prisma as any, {} as any, {} as any, {} as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { run: () => (ctrl as any).ensureDefaults(), prisma };
  }

  it('DB 已有其他聯賽、缺 asian-cup → 只新增 asian-cup，不動既有列', async () => {
    const all = Object.keys(LEAGUE_CONFIG);
    const { run, prisma } = make(all.filter((s) => s !== 'asian-cup'));
    await run();
    const data = prisma.sportsConfig.createMany.mock.calls[0][0].data;
    expect(data.map((c: { boardSlug: string }) => c.boardSlug)).toEqual(['asian-cup']);
    expect(prisma.sportsConfig.update).not.toHaveBeenCalled();
    expect(prisma.sportsConfig.upsert).not.toHaveBeenCalled();
  });

  it('全部都在 → 什麼都不寫', async () => {
    const { run, prisma } = make(Object.keys(LEAGUE_CONFIG));
    await run();
    expect(prisma.sportsConfig.createMany).not.toHaveBeenCalled();
  });
});

describe('SportsService 隊名翻譯含國家隊', () => {
  function make(rows: Array<{ apiId: number; entityType: string; nameZhTw: string }>) {
    const prisma = {
      translation: {
        // 照 where.entityType 過濾，才抓得到「查詢條件漏了 country」這種錯
        findMany: jest.fn().mockImplementation(({ where }: { where: { entityType: string | { in: string[] } } }) => {
          const allowed = typeof where.entityType === 'string' ? [where.entityType] : where.entityType.in;
          return Promise.resolve(rows.filter((r) => allowed.includes(r.entityType)).map((r) => ({ shortName: null, ...r })));
        }),
      },
    };
    const config = { get: jest.fn().mockReturnValue('') };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new SportsService(config as any, {} as any, prisma as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ids: number[]) => (svc as any).getTeamTranslations(ids, 'football');
  }

  it("只有 'country' 譯名的國家隊也查得到", async () => {
    const lookup = make([{ apiId: 12, entityType: 'country', nameZhTw: '日本' }]);
    expect((await lookup([12])).get(12)?.nameZhTw).toBe('日本');
  });

  it("同 id 兩種都有 → 'team' 優先（不論資料順序）", async () => {
    const a = make([
      { apiId: 7, entityType: 'country', nameZhTw: '國家名' },
      { apiId: 7, entityType: 'team', nameZhTw: '隊名' },
    ]);
    const b = make([
      { apiId: 7, entityType: 'team', nameZhTw: '隊名' },
      { apiId: 7, entityType: 'country', nameZhTw: '國家名' },
    ]);
    expect((await a([7])).get(7)?.nameZhTw).toBe('隊名');
    expect((await b([7])).get(7)?.nameZhTw).toBe('隊名');
  });
});
