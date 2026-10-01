// 2026-10-01 兩個回歸：
//   1. 空結果快取上限——訂閱到期時 API 回 []，舊版存 24 小時，續費後頁面仍空一天
//   2. 通用足球排名隊名換中文——舊版排名完全沒翻譯（比賽列表有），亞洲盃/英超排名都是英文

import { cacheTtlFor, EMPTY_RESULT_TTL } from '../common/cache-ttl.util';
import { SportsService } from './sports.service';

describe('cacheTtlFor', () => {
  it('空陣列最多存 EMPTY_RESULT_TTL 秒', () => {
    expect(cacheTtlFor([], 86400)).toBe(EMPTY_RESULT_TTL);
  });
  it('原 ttl 比上限短時照原 ttl', () => {
    expect(cacheTtlFor([], 60)).toBe(60);
  });
  it('有資料照原 ttl', () => {
    expect(cacheTtlFor([{ id: 1 }], 86400)).toBe(86400);
    expect(cacheTtlFor({ a: 1 }, 86400)).toBe(86400);
  });
});

function makeSvc(opts: { cached?: unknown; apiResponse?: unknown; translations?: Array<{ apiId: number; nameZhTw: string }> }) {
  const redis = {
    get: jest.fn().mockResolvedValue(opts.cached ?? null),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    sportsConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    translation: {
      findMany: jest.fn().mockResolvedValue(
        (opts.translations ?? []).map((t) => ({ ...t, entityType: 'country', shortName: null })),
      ),
    },
  };
  const config = { get: jest.fn().mockReturnValue('fake-key') };
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ response: opts.apiResponse ?? [], errors: {} }),
  }) as unknown as typeof fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = new SportsService(config as any, redis as any, prisma as any);
  return { svc, redis };
}

describe('SportsService.getStandings', () => {
  const FOOTBALL_STANDINGS = [
    { league: { id: 7, standings: [[
      { rank: 1, team: { id: 12, name: 'Japan', logo: 'x' } },
      { rank: 2, team: { id: 99, name: 'Qatar', logo: 'y' } },
    ]] } },
  ];

  it('足球排名的隊名換成中文，沒譯名的維持原文', async () => {
    const { svc } = makeSvc({ apiResponse: FOOTBALL_STANDINGS, translations: [{ apiId: 12, nameZhTw: '日本' }] });
    const out = (await svc.getStandings('asian-cup')) as typeof FOOTBALL_STANDINGS;
    const rows = out[0].league.standings[0];
    expect(rows[0].team.name).toBe('日本');
    expect(rows[0].team.logo).toBe('x');
    expect(rows[1].team.name).toBe('Qatar');
  });

  it('快取命中時也會翻譯（新譯名不必等快取過期）', async () => {
    const { svc } = makeSvc({ cached: FOOTBALL_STANDINGS, translations: [{ apiId: 12, nameZhTw: '日本' }] });
    const out = (await svc.getStandings('asian-cup')) as typeof FOOTBALL_STANDINGS;
    expect(out[0].league.standings[0][0].team.name).toBe('日本');
  });

  it('API 回空陣列 → 只快取 EMPTY_RESULT_TTL 秒', async () => {
    const { svc, redis } = makeSvc({ apiResponse: [] });
    await svc.getStandings('asian-cup');
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), [], EMPTY_RESULT_TTL);
  });
});
