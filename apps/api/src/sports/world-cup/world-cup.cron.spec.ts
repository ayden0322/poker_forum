// WorldCupCron.fullSync 停止條件回歸測試（2026-10-01）。
// 踩坑：DB status 不可靠，未配對場次永遠停在 scheduled，導致賽後每 5 分鐘仍打 /fixtures 空燒足球額度。
// 現改為「最後一場開賽超過寬限期就停」，此測試釘住，避免有人改回只看 status。

jest.mock('./world-cup.apisports', () => ({
  ...jest.requireActual('./world-cup.apisports'),
  callFootballApi: jest.fn().mockResolvedValue([]),
  syncWorldCupScores: jest.fn().mockResolvedValue({ updated: 0, unmatched: [] }),
}));

import { WorldCupCron } from './world-cup.cron';
import { callFootballApi } from './world-cup.apisports';

const DAY = 24 * 60 * 60 * 1000;

function makeCron(opts: { pending: number; lastKickoff: Date | null }) {
  const prisma = {
    worldCupMatch: {
      count: jest.fn().mockResolvedValue(opts.pending),
      aggregate: jest.fn().mockResolvedValue({ _max: { kickoffAt: opts.lastKickoff } }),
    },
  };
  const config = { get: jest.fn().mockReturnValue('fake-key') };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new WorldCupCron(prisma as any, config as any, {} as any);
}

describe('WorldCupCron.fullSync 停止條件', () => {
  beforeEach(() => (callFootballApi as jest.Mock).mockClear());

  it('DB 仍有未完賽場次，但最後一場開賽已超過 3 天 → 不打 API', async () => {
    await makeCron({ pending: 5, lastKickoff: new Date(Date.now() - 10 * DAY) }).fullSync();
    expect(callFootballApi).not.toHaveBeenCalled();
  });

  it('賽事期間（最後一場尚未開賽）→ 照常同步', async () => {
    await makeCron({ pending: 5, lastKickoff: new Date(Date.now() + 10 * DAY) }).fullSync();
    expect(callFootballApi).toHaveBeenCalledTimes(1);
  });

  it('決賽剛踢完 1 天內 → 仍同步，讓比分定版', async () => {
    await makeCron({ pending: 1, lastKickoff: new Date(Date.now() - 1 * DAY) }).fullSync();
    expect(callFootballApi).toHaveBeenCalledTimes(1);
  });

  it('全部已完賽 → 不打 API', async () => {
    await makeCron({ pending: 0, lastKickoff: new Date(Date.now() - 1 * DAY) }).fullSync();
    expect(callFootballApi).not.toHaveBeenCalled();
  });
});
