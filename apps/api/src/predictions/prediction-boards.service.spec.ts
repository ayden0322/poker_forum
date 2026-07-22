// PredictionBoardsService 回歸測試（2026-07-22 圓桌補）。
// 守兩個東西：
//   1. 三個防呆（不支援運動略過／無玩法略過／非法玩法過濾）
//   2. settlementTargets 的致命傷修正 —— 關閉板塊不得停掉既有注單的結算。
//      這是整場圓桌最重的一刀，必須有測試釘死，否則哪天有人把它改回 enabled() 不會有紅燈。

import { PredictionBoardsService } from './prediction-boards.service';

function makeSvc() {
  const prisma = {
    sportsConfig: { findMany: jest.fn(), findUnique: jest.fn() },
    predictionMatch: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
  const config = { get: jest.fn().mockReturnValue('') }; // 空 API key → resolveSeason 直接回 fallback，不打網路
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = new PredictionBoardsService(prisma as any, redis as any, config as any);
  return { svc, prisma };
}

const mlb = {
  boardSlug: 'mlb', sportType: 'baseball', apiHost: 'v1.baseball.api-sports.io',
  leagueId: 1, season: '2026', bookmakerId: 22, predictionMarkets: ['WINLOSE'],
  predictionEnabled: true, enabled: true,
};

describe('PredictionBoardsService.enabled 防呆', () => {
  afterEach(() => jest.clearAllMocks());

  it('略過賠率管線不支援的運動（basketball），不列入 enabled()', async () => {
    const { svc, prisma } = makeSvc();
    prisma.sportsConfig.findMany.mockResolvedValue([
      mlb,
      { ...mlb, boardSlug: 'nba', sportType: 'basketball' },
    ]);
    const boards = await svc.enabled();
    expect(boards.map((b) => b.boardSlug)).toEqual(['mlb']); // nba 被擋下
  });

  it('略過沒設任何玩法的板塊', async () => {
    const { svc, prisma } = makeSvc();
    prisma.sportsConfig.findMany.mockResolvedValue([{ ...mlb, predictionMarkets: [] }]);
    expect(await svc.enabled()).toEqual([]);
  });

  it('過濾掉非法玩法值，全非法則整個略過', async () => {
    const { svc, prisma } = makeSvc();
    prisma.sportsConfig.findMany.mockResolvedValue([{ ...mlb, predictionMarkets: ['GARBAGE'] }]);
    expect(await svc.enabled()).toEqual([]);
  });

  it('invalidate() 後下一次 enabled() 必須重打 DB（不吃舊快取）', async () => {
    const { svc, prisma } = makeSvc();
    prisma.sportsConfig.findMany.mockResolvedValue([mlb]);
    await svc.enabled();
    await svc.enabled(); // 快取命中，不應再打 DB
    expect(prisma.sportsConfig.findMany).toHaveBeenCalledTimes(1);
    svc.invalidate();
    await svc.enabled(); // 快取失效，重打
    expect(prisma.sportsConfig.findMany).toHaveBeenCalledTimes(2);
  });
});

describe('PredictionBoardsService.settlementTargets（致命傷修正）', () => {
  afterEach(() => jest.clearAllMocks());

  it('關閉的板塊若仍有已開賽未結算的賽事 → 必須列入結算對象（不然注單永久卡死）', async () => {
    const { svc, prisma } = makeSvc();
    // enabled() 回空（板塊都關了）
    prisma.sportsConfig.findMany.mockResolvedValue([]);
    // 但有一場已開賽未結算的 mlb 賽事
    prisma.predictionMatch.findMany.mockResolvedValue([{ boardSlug: 'mlb' }]);
    // bySlug 查得到 mlb 設定（enabled=false）
    prisma.sportsConfig.findUnique.mockResolvedValue({ ...mlb, predictionEnabled: false });

    const targets = await svc.settlementTargets();
    expect(targets.map((b) => b.boardSlug)).toContain('mlb'); // 關了照樣要結算
  });

  it('開放中的板塊本來就在結算對象內，不因去重而漏掉', async () => {
    const { svc, prisma } = makeSvc();
    prisma.sportsConfig.findMany.mockResolvedValue([mlb]); // mlb 開放中
    prisma.predictionMatch.findMany.mockResolvedValue([{ boardSlug: 'mlb' }]); // 同一個板塊也有債
    const targets = await svc.settlementTargets();
    // 不能因為 enabled 已含 mlb、debt 也有 mlb 就重複；也不能漏
    expect(targets.filter((b) => b.boardSlug === 'mlb')).toHaveLength(1);
  });

  it('有債的板塊在 sports_configs 查無設定 → 略過（記 error），不讓整輪結算爆炸', async () => {
    const { svc, prisma } = makeSvc();
    prisma.sportsConfig.findMany.mockResolvedValue([]);
    prisma.predictionMatch.findMany.mockResolvedValue([{ boardSlug: 'ghost' }]);
    prisma.sportsConfig.findUnique.mockResolvedValue(null); // 板塊設定被刪
    const targets = await svc.settlementTargets();
    expect(targets).toEqual([]); // 不含 ghost，也不丟例外
  });
});
