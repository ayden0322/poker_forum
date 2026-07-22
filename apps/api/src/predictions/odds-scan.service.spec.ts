// OddsScanService 回歸測試（2026-07-22 圓桌 QA 席補）。
// 這支服務的核心邏輯自己踩過三個坑，都必須有測試釘住，否則下一個人「順手改回去」不會有紅燈：
//   1. 掃描必須帶 bookmaker（Codex 指出）——不帶會聚合所有莊家，給空板塊假訊號
//   2. 分頁按日期升冪，必須取最後一頁——只看第一頁會漏掉未來場次（歐冠曾被誤判休賽期）
//   3. 每次外呼要計進 quota——否則額度守門低估用量

import { OddsScanService } from './odds-scan.service';

// 用 fetch mock 餵固定 JSON，不打真實 API
function mockFetchSequence(responses: Array<{ ok?: boolean; body: unknown }>) {
  let i = 0;
  return jest.fn().mockImplementation(() => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return Promise.resolve({
      ok: r.ok ?? true,
      status: r.ok === false ? 429 : 200,
      json: () => Promise.resolve(r.body),
    });
  });
}

function makeSvc() {
  const prisma = {
    sportsConfig: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const redis = { incrWithTtl: jest.fn().mockResolvedValue(1) };
  const config = { get: jest.fn().mockReturnValue('fake-key') };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = new OddsScanService(prisma as any, redis as any, config as any);
  return { svc, prisma, redis };
}

const FOOTBALL_LEAGUE = {
  boardSlug: 'ucl', displayName: '歐冠', sportType: 'football',
  apiHost: 'v3.football.api-sports.io', leagueId: 2, season: '2026', bookmakerId: 7,
};

// /leagues 回應：current season = 2026，賽季區間涵蓋 today
const leaguesResp = {
  response: [{ seasons: [{ year: 2026, current: true, start: '2026-01-01', end: '2026-12-31' }] }],
};

describe('OddsScanService', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; jest.clearAllMocks(); });

  it('掃描 /odds 必須帶 bookmaker（否則聚合所有莊家 → 空板塊假訊號）', async () => {
    const { svc, prisma } = makeSvc();
    prisma.sportsConfig.findMany.mockResolvedValue([FOOTBALL_LEAGUE]);
    const future = new Date(Date.now() + 3 * 86400_000).toISOString();
    global.fetch = mockFetchSequence([
      { body: leaguesResp },
      { body: { results: 1, paging: { total: 1 }, response: [{ fixture: { date: future }, bookmakers: [{ id: 7, name: 'William Hill', bets: [{ name: 'Match Winner' }] }] }] } },
    ]);
    await svc.scanAll(['ucl']);
    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0] as string);
    const oddsUrl = urls.find((u) => u.includes('/odds'));
    expect(oddsUrl).toContain('bookmaker=7');
  });

  it('分頁 total>1 時必須請求最後一頁（未來場次在升冪的最後）', async () => {
    const { svc, prisma } = makeSvc();
    prisma.sportsConfig.findMany.mockResolvedValue([FOOTBALL_LEAGUE]);
    const past = '2026-07-01T00:00:00+00:00';
    const future = new Date(Date.now() + 3 * 86400_000).toISOString();
    global.fetch = mockFetchSequence([
      { body: leaguesResp },
      // 第一頁：全是過去場次，paging.total=3
      { body: { results: 30, paging: { total: 3 }, response: [{ fixture: { date: past }, bookmakers: [{ id: 7, name: 'WH', bets: [{ name: 'Match Winner' }] }] }] } },
      // 最後一頁：含未來場次
      { body: { results: 30, paging: { total: 3 }, response: [{ fixture: { date: future }, bookmakers: [{ id: 7, name: 'WH', bets: [{ name: 'Match Winner' }] }] }] } },
    ]);
    const [row] = await svc.scanAll(['ucl']);
    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('page=3'))).toBe(true); // 有去要最後一頁
    expect(row.available).toBe(true); // 因此數得到未來場次
    expect(row.futureCount).toBe(1);
  });

  it('每次外呼都計進 quota（否則額度守門低估用量）', async () => {
    const { svc, prisma, redis } = makeSvc();
    prisma.sportsConfig.findMany.mockResolvedValue([FOOTBALL_LEAGUE]);
    global.fetch = mockFetchSequence([
      { body: leaguesResp },
      { body: { results: 1, paging: { total: 1 }, response: [{ fixture: { date: new Date().toISOString() }, bookmakers: [] }] } },
    ]);
    await svc.scanAll(['ucl']);
    // /leagues + /odds = 2 次外呼 → incrWithTtl 至少被叫 2 次
    expect(redis.incrWithTtl).toHaveBeenCalledTimes(2);
  });

  it('API-Sports 回 200 但帶 errors → 視為失敗，不寫入 available（配額用盡不能當正常結果）', async () => {
    const { svc, prisma } = makeSvc();
    prisma.sportsConfig.findMany.mockResolvedValue([FOOTBALL_LEAGUE]);
    global.fetch = mockFetchSequence([
      { body: leaguesResp },
      { body: { errors: { requests: 'quota reached' }, results: 0, response: [] } },
    ]);
    const [row] = await svc.scanAll(['ucl']);
    expect(row.available).toBe(false);
    expect(row.note).toContain('查詢失敗'); // call() 回 null → scanOne 走查詢失敗分支
  });

  it('賽季區間內但 0 盤口 → 標「賽季進行中但無盤口」（跟休賽期分開）', async () => {
    const { svc, prisma } = makeSvc();
    prisma.sportsConfig.findMany.mockResolvedValue([FOOTBALL_LEAGUE]);
    global.fetch = mockFetchSequence([
      { body: leaguesResp }, // 賽季 2026-01-01~12-31，涵蓋 today
      { body: { results: 0, response: [] } },
    ]);
    const [row] = await svc.scanAll(['ucl']);
    expect(row.available).toBe(false);
    expect(row.note).toContain('賽季進行中但無盤口');
  });

  it('併發鎖：掃描進行中再次呼叫 → 丟 409，不重複燒額度', async () => {
    const { svc, prisma } = makeSvc();
    prisma.sportsConfig.findMany.mockResolvedValue([FOOTBALL_LEAGUE]);
    // 讓 fetch 慢一點，確保第一輪還沒結束第二輪就進來
    let resolveFirst: () => void = () => {};
    const gate = new Promise<void>((res) => { resolveFirst = res; });
    global.fetch = jest.fn().mockImplementation(async () => {
      await gate;
      return { ok: true, status: 200, json: () => Promise.resolve(leaguesResp) };
    });
    const p1 = svc.scanAll(['ucl']);
    await expect(svc.scanAll(['ucl'])).rejects.toThrow(); // 第二輪立刻被鎖擋下
    resolveFirst();
    await p1.catch(() => {});
  });
});
