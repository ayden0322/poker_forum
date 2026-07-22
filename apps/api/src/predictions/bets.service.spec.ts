import { HttpException } from '@nestjs/common';
import { Prisma } from '@betting-forum/database';
import { BetsService, PlaceBetInput } from './bets.service';
import { InsufficientBalanceError } from '../economy/economy.service';
import { QUOTE_MAX_AGE_MS, DAILY_STAKE_CAP } from './prediction.config';

const D = (n: number) => new Prisma.Decimal(n);

function makeMocks(oddsNum = 1.85) {
  const future = new Date(Date.now() + 60 * 60 * 1000); // 1 小時後開賽
  const match = {
    id: 'm1',
    boardSlug: 'mlb', // 與 boardsCfgMock 的 DEFAULT_BOARD 一致（原本寫 world-cup，與 mock 對不上）
    sportType: 'baseball',
    apiFixtureId: 1562344,
    apiStatus: 'NS',
    startTime: future,
    settledAt: null,
    frozenAt: null,
  };
  const quote = {
    id: 'q1',
    matchId: 'm1',
    market: 'WINLOSE',
    selection: 'HOME',
    line: null,
    odds: D(oddsNum),
    fetchedAt: new Date(), // 新鮮
    active: true,
  };
  const txMock = {
    walletAccount: { upsert: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'w1' }]),
    predictionMatch: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ apiStatus: 'NS', startTime: future, settledAt: null, frozenAt: null }),
    },
    oddsQuote: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ active: true, fetchedAt: new Date(), odds: D(oddsNum) }),
    },
    bet: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { stake: 0 } }),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: 'b1', stake: data.stake, line: data.line, lockedOdds: data.lockedOdds,
          potentialPayout: data.potentialPayout, status: 'PENDING',
        })),
    },
  };
  const prisma: any = {
    predictionMatch: { findUnique: jest.fn().mockResolvedValue(match) },
    oddsQuote: { findUnique: jest.fn().mockResolvedValue(quote), findFirst: jest.fn() },
    bet: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(txMock)),
  };
  const economy: any = { debitInTx: jest.fn().mockResolvedValue({}) };
  const pipeline: any = { revalidateMatch: jest.fn().mockResolvedValue(true) };
  const matchLink: any = { detailUrl: jest.fn().mockResolvedValue(null) };
  return { prisma, economy, pipeline, matchLink, txMock, match, quote, future };
}

const validInput: PlaceBetInput = {
  matchId: 'm1', market: 'WINLOSE', selection: 'HOME',
  stake: 500, quoteId: 'q1', clientOdds: 1.85,
};

async function expectReject(p: Promise<unknown>, code: string) {
  try {
    await p;
    fail(`應拒單 ${code}`);
  } catch (e) {
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getResponse()).toMatchObject({ code });
  }
}

// 建構子相依的最小 mock（HonorService 於榮譽系統加入、PredictionBoardsService 於板塊搬進後台時加入）
const honorMock = () => ({ onFollowed: jest.fn() }) as never;
// 預設板塊：開放中的 MLB 板塊。boardSlug/bookmakerId 要與 makeMocks 的 match/quote 一致。
const DEFAULT_BOARD = {
  boardSlug: 'mlb', sportType: 'baseball', apiHost: 'v1.baseball.api-sports.io',
  leagueId: 1, season: '2026', bookmakerId: 22, markets: ['WINLOSE'], enabled: true,
};
// board 可注入：傳 null 模擬「查無此板塊」，傳 {enabled:false} 模擬「板塊已下線」等情境，
// 讓 placeBet/跟單的守衛真的被測到（原本寫死永遠放行，那個 if 的擋單分支從沒被進入過）。
const boardsCfgMock = (board: unknown = DEFAULT_BOARD) => ({
  bySlug: jest.fn().mockResolvedValue(board),
  enabled: jest.fn().mockResolvedValue([]),
  settlementTargets: jest.fn().mockResolvedValue([]),
  invalidate: jest.fn(),
}) as never;

describe('BetsService.placeBet', () => {
  beforeAll(() => { process.env.PREDICTION_ENABLED = 'true'; });
  afterAll(() => { delete process.env.PREDICTION_ENABLED; });

  it('happy path：錢包鎖→重查→鎖權威賠率、floor 派彩、bet_stake 冪等鍵', async () => {
    const { prisma, economy, pipeline, matchLink, txMock } = makeMocks();
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    const r = await svc.placeBet('u1', validInput);

    expect(r.betId).toBe('b1');
    expect(r.potentialPayout).toBe(925); // 500 × 1.85
    expect(txMock.$queryRaw).toHaveBeenCalled(); // 錢包行鎖（H1）
    expect(txMock.oddsQuote.findUniqueOrThrow).toHaveBeenCalled(); // 交易內 quote 重查（H2）
    expect(economy.debitInTx).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({
        currency: 'P', amount: 500, reason: 'PREDICTION_STAKE', idempotencyKey: 'bet_stake:b1',
      }),
    );
  });

  it('派彩精度（M1）：100×1.15 必須是 115，不能被浮點吃成 114', async () => {
    const { prisma, economy, pipeline, matchLink } = makeMocks(1.15);
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    expect(Math.floor(100 * 1.15)).toBe(114); // JS 浮點的坑本尊
    const r = await svc.placeBet('u1', { ...validInput, stake: 100, clientOdds: 1.15 });
    expect(r.potentialPayout).toBe(115); // Decimal 算的正確值
  });

  it('請求級冪等（M2）：同 requestId 已成單 → 回既有單、不再扣款', async () => {
    const { prisma, economy, pipeline, matchLink } = makeMocks();
    prisma.bet.findUnique.mockResolvedValue({
      id: 'b0', stake: 500, line: null, lockedOdds: D(1.85), potentialPayout: 925, status: 'PENDING',
    });
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    const r = await svc.placeBet('u1', { ...validInput, requestId: 'req-1' });
    expect(r.betId).toBe('b0');
    expect(r.idempotentReplay).toBe(true);
    expect(economy.debitInTx).not.toHaveBeenCalled();
  });

  it('功能開關關閉 → PREDICTION_DISABLED（fail-closed）', async () => {
    delete process.env.PREDICTION_ENABLED;
    const { prisma, economy, pipeline, matchLink } = makeMocks();
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    await expectReject(svc.placeBet('u1', validInput), 'PREDICTION_DISABLED');
    process.env.PREDICTION_ENABLED = 'true';
  });

  it('已開賽（apiStatus != NS）→ MARKET_LOCKED', async () => {
    const { prisma, economy, pipeline, matchLink, match } = makeMocks();
    prisma.predictionMatch.findUnique.mockResolvedValue({ ...match, apiStatus: '1H' });
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    await expectReject(svc.placeBet('u1', validInput), 'MARKET_LOCKED');
  });

  it('進入封盤 buffer → MARKET_LOCKED', async () => {
    const { prisma, economy, pipeline, matchLink, match } = makeMocks();
    prisma.predictionMatch.findUnique.mockResolvedValue({
      ...match, startTime: new Date(Date.now() + 60 * 1000), // 1 分鐘後開賽 < 3 分 buffer
    });
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    await expectReject(svc.placeBet('u1', validInput), 'MARKET_LOCKED');
  });

  it('凍結中的賽事（延賽）→ MARKET_LOCKED', async () => {
    const { prisma, economy, pipeline, matchLink, match } = makeMocks();
    prisma.predictionMatch.findUnique.mockResolvedValue({ ...match, frozenAt: new Date() });
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    await expectReject(svc.placeBet('u1', validInput), 'MARKET_LOCKED');
  });

  it('已結算關場的賽事（取消後 API 翻回 NS+未來時間）→ MARKET_LOCKED，不可復活收注', async () => {
    const { prisma, economy, pipeline, matchLink, match } = makeMocks();
    prisma.predictionMatch.findUnique.mockResolvedValue({ ...match, settledAt: new Date() });
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    await expectReject(svc.placeBet('u1', validInput), 'MARKET_LOCKED');
  });

  // ===== 圓桌（2026-07-22）補：板塊開關守衛。原本 mock 寫死永遠放行，這些擋單分支從沒被測過 =====

  it('板塊已下線（enabled=false）→ MARKET_LOCKED，且不得扣款', async () => {
    const { prisma, economy, pipeline, matchLink } = makeMocks();
    const board = { boardSlug: 'mlb', sportType: 'baseball', apiHost: 'v1.baseball.api-sports.io', leagueId: 1, season: '2026', bookmakerId: 22, markets: ['WINLOSE'], enabled: false };
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock(board));
    await expectReject(svc.placeBet('u1', validInput), 'MARKET_LOCKED');
    expect(economy.debitInTx).not.toHaveBeenCalled(); // 擋單不能扣 P 幣
  });

  it('板塊沒開這個玩法（markets 不含此 market）→ MARKET_LOCKED，不扣款', async () => {
    const { prisma, economy, pipeline, matchLink } = makeMocks();
    const board = { boardSlug: 'mlb', sportType: 'baseball', apiHost: 'v1.baseball.api-sports.io', leagueId: 1, season: '2026', bookmakerId: 22, markets: ['OVER_UNDER'], enabled: true };
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock(board));
    await expectReject(svc.placeBet('u1', validInput), 'MARKET_LOCKED'); // validInput 是 WINLOSE
    expect(economy.debitInTx).not.toHaveBeenCalled();
  });

  it('sports_configs 查無此板塊（bySlug 回 null）→ MARKET_LOCKED，不得放行', async () => {
    const { prisma, economy, pipeline, matchLink } = makeMocks();
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock(null));
    await expectReject(svc.placeBet('u1', validInput), 'MARKET_LOCKED');
    expect(economy.debitInTx).not.toHaveBeenCalled();
  });

  it('quote 與下注組合不符 → STALE_ODDS', async () => {
    const { prisma, economy, pipeline, matchLink, quote } = makeMocks();
    prisma.oddsQuote.findUnique.mockResolvedValue({ ...quote, selection: 'AWAY' });
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    await expectReject(svc.placeBet('u1', validInput), 'STALE_ODDS');
  });

  it('quote 超齡且重驗失敗 → FEED_DOWN（fail-closed）', async () => {
    const { prisma, economy, pipeline, matchLink, quote } = makeMocks();
    prisma.oddsQuote.findUnique.mockResolvedValue({
      ...quote, fetchedAt: new Date(Date.now() - QUOTE_MAX_AGE_MS - 1000),
    });
    pipeline.revalidateMatch.mockResolvedValue(false);
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    await expectReject(svc.placeBet('u1', validInput), 'FEED_DOWN');
    expect(economy.debitInTx).not.toHaveBeenCalled();
  });

  it('quote 超齡、重驗成功但賠率變了 → ODDS_CHANGED 帶新值', async () => {
    const { prisma, economy, pipeline, matchLink, quote } = makeMocks();
    prisma.oddsQuote.findUnique.mockResolvedValue({
      ...quote, fetchedAt: new Date(Date.now() - QUOTE_MAX_AGE_MS - 1000),
    });
    prisma.oddsQuote.findFirst.mockResolvedValue({ ...quote, id: 'q2', odds: D(1.72), fetchedAt: new Date() });
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    try {
      await svc.placeBet('u1', validInput);
      fail('應拒單');
    } catch (e) {
      const body = (e as HttpException).getResponse() as any;
      expect(body.code).toBe('ODDS_CHANGED');
      expect(body.data).toMatchObject({ quoteId: 'q2', odds: 1.72 });
    }
    expect(economy.debitInTx).not.toHaveBeenCalled();
  });

  it('前端賠率與權威值不符（新鮮 quote）→ ODDS_CHANGED', async () => {
    const { prisma, economy, pipeline, matchLink } = makeMocks();
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    await expectReject(svc.placeBet('u1', { ...validInput, clientOdds: 9.9 }), 'ODDS_CHANGED');
  });

  it('每日總額上限（交易內、鎖後聚合）→ LIMIT_EXCEEDED', async () => {
    const { prisma, economy, pipeline, matchLink, txMock } = makeMocks();
    txMock.bet.aggregate
      .mockResolvedValueOnce({ _sum: { stake: DAILY_STAKE_CAP } }) // 今日已滿
      .mockResolvedValueOnce({ _sum: { stake: 0 } });
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    await expectReject(svc.placeBet('u1', validInput), 'LIMIT_EXCEEDED');
    expect(economy.debitInTx).not.toHaveBeenCalled();
  });

  it('單注超過上限 → LIMIT_EXCEEDED（不打 DB）', async () => {
    const { prisma, economy, pipeline, matchLink } = makeMocks();
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    await expectReject(svc.placeBet('u1', { ...validInput, stake: 999_999 }), 'LIMIT_EXCEEDED');
    expect(prisma.predictionMatch.findUnique).not.toHaveBeenCalled();
  });

  it('交易內封盤重查：交易期間賽事翻 live → MARKET_LOCKED、不扣款', async () => {
    const { prisma, economy, pipeline, matchLink, txMock } = makeMocks();
    txMock.predictionMatch.findUniqueOrThrow.mockResolvedValue({
      apiStatus: 'LIVE', startTime: new Date(Date.now() + 60 * 60 * 1000), settledAt: null, frozenAt: null,
    });
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    await expectReject(svc.placeBet('u1', validInput), 'MARKET_LOCKED');
    expect(economy.debitInTx).not.toHaveBeenCalled();
  });

  it('交易內 quote 重查（H2）：交易期間 pipeline 翻盤 → STALE_ODDS、不扣款', async () => {
    const { prisma, economy, pipeline, matchLink, txMock } = makeMocks();
    txMock.oddsQuote.findUniqueOrThrow.mockResolvedValue({
      active: false, fetchedAt: new Date(), odds: D(1.85), // 剛被翻掉
    });
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    await expectReject(svc.placeBet('u1', validInput), 'STALE_ODDS');
    expect(economy.debitInTx).not.toHaveBeenCalled();
  });

  it('餘額不足 → INSUFFICIENT_BALANCE', async () => {
    const { prisma, economy, pipeline, matchLink } = makeMocks();
    economy.debitInTx.mockRejectedValue(new InsufficientBalanceError('P' as any, 500, 100));
    const svc = new BetsService(prisma, economy, pipeline, matchLink, honorMock(), boardsCfgMock());
    await expectReject(svc.placeBet('u1', validInput), 'INSUFFICIENT_BALANCE');
  });
});
