// TranslationCron 額度回歸測試（2026-10-01）。
// 踩坑：每小時對每個聯賽的每支隊伍打一次 /players，後台補進 21 個聯賽後籃球估計 >7,500 次/日（Pro 上限）。
// 現改為球員名單每聯賽一天一次，球隊名單仍每小時。

import { TranslationCron } from './translation.cron';

const LEAGUE = {
  boardSlug: 'eurocup', sportType: 'basketball',
  apiHost: 'v1.basketball.api-sports.io', leagueId: 194, season: '2026',
};

function setup() {
  const fetchMock = jest.fn().mockImplementation((url: string) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        response: url.includes('/teams')
          ? [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }]
          : [],
      }),
    }),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  const translation = { findMissing: jest.fn().mockResolvedValue([]), translateBatch: jest.fn() };
  const config = { get: jest.fn().mockReturnValue('fake-key') };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cron = new TranslationCron({} as any, config as any, translation as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = () => (cron as any).processLeague(LEAGUE);
  const calls = (path: string) => fetchMock.mock.calls.filter(([u]) => String(u).includes(path)).length;
  return { run, calls };
}

describe('TranslationCron 球員名單一天掃一次', () => {
  afterEach(() => jest.useRealTimers());

  it('同一天跑第二次只打 /teams，不再逐隊打 /players', async () => {
    const { run, calls } = setup();
    await run();
    expect(calls('/players')).toBe(3);
    await run();
    expect(calls('/teams')).toBe(2);
    expect(calls('/players')).toBe(3);
  });

  it('過了 24 小時再掃一次球員', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-01T00:00:00Z') });
    const { run, calls } = setup();
    await run();
    jest.setSystemTime(new Date('2026-10-02T00:00:01Z'));
    await run();
    expect(calls('/players')).toBe(6);
  });
});
