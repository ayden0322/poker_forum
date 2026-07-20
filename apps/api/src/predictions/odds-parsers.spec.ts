import { parseBaseballOddsItem, parseFootballFixture, parseFootballOddsItem } from './odds-parsers';

describe('odds-parsers', () => {
  describe('parseFootballOddsItem', () => {
    const item = {
      fixture: { id: 1562344, date: '2026-07-08T19:00:00+00:00' },
      bookmakers: [
        {
          id: 7,
          bets: [
            {
              name: 'Match Winner',
              values: [
                { value: 'Home', odd: '1.75' },
                { value: 'Draw', odd: '3.40' },
                { value: 'Away', odd: '4.80' },
              ],
            },
            {
              name: 'Goals Over/Under',
              values: [
                { value: 'Over 2.5', odd: '1.90' },
                { value: 'Under 2.5', odd: '1.85' },
                { value: 'Over 3.5', odd: '3.25' },
              ],
            },
            {
              name: 'Both Teams Score', // 不在二期玩法 → 忽略
              values: [{ value: 'Yes', odd: '1.72' }],
            },
          ],
        },
      ],
    };

    it('解析 1X2（含和局）與大小分多線', () => {
      const r = parseFootballOddsItem(item, 7, ['WINLOSE', 'OVER_UNDER']);
      expect(r.apiFixtureId).toBe(1562344);
      expect(r.quotes).toEqual(
        expect.arrayContaining([
          { market: 'WINLOSE', selection: 'HOME', line: null, odds: 1.75 },
          { market: 'WINLOSE', selection: 'DRAW', line: null, odds: 3.4 },
          { market: 'WINLOSE', selection: 'AWAY', line: null, odds: 4.8 },
          { market: 'OVER_UNDER', selection: 'OVER', line: 2.5, odds: 1.9 },
          { market: 'OVER_UNDER', selection: 'UNDER', line: 2.5, odds: 1.85 },
          { market: 'OVER_UNDER', selection: 'OVER', line: 3.5, odds: 3.25 },
        ]),
      );
      // Both Teams Score 被忽略
      expect(r.quotes).toHaveLength(6);
    });

    it('markets 白名單過濾：只開勝負時不吐大小分', () => {
      const r = parseFootballOddsItem(item, 7, ['WINLOSE']);
      expect(r.quotes.every((q) => q.market === 'WINLOSE')).toBe(true);
      expect(r.quotes).toHaveLength(3);
    });

    it('指定 bookmaker 不在回應中 → 空報價', () => {
      const r = parseFootballOddsItem(item, 8, ['WINLOSE', 'OVER_UNDER']);
      expect(r.quotes).toHaveLength(0);
    });

    it('賠率 ≤1 的髒資料不入庫', () => {
      const dirty = {
        fixture: { id: 1, date: '2026-07-08T19:00:00+00:00' },
        bookmakers: [
          { id: 7, bets: [{ name: 'Match Winner', values: [{ value: 'Home', odd: '1.00' }, { value: 'Away', odd: 'abc' }] }] },
        ],
      };
      expect(parseFootballOddsItem(dirty, 7, ['WINLOSE']).quotes).toHaveLength(0);
    });
  });

  describe('parseBaseballOddsItem', () => {
    const item = {
      game: {
        id: 179402,
        date: '2026-07-08T01:40:00+00:00',
        status: { short: 'NS' },
        teams: { home: { name: 'San Diego Padres' }, away: { name: 'Arizona Diamondbacks' } },
      },
      bookmakers: [
        {
          id: 22,
          bets: [
            { name: 'Home/Away', values: [{ value: 'Home', odd: '1.80' }, { value: 'Away', odd: '2.00' }] },
            { name: 'Odd/Even (Including OT)', values: [{ value: 'Odd', odd: '1.62' }] }, // 忽略
          ],
        },
      ],
    };

    it('解析錢線 + 自帶賽事資訊（teams/status）', () => {
      const r = parseBaseballOddsItem(item, 22, ['WINLOSE']);
      expect(r.apiFixtureId).toBe(179402);
      expect(r.apiStatus).toBe('NS');
      expect(r.homeName).toBe('San Diego Padres');
      expect(r.awayName).toBe('Arizona Diamondbacks');
      expect(r.quotes).toEqual([
        { market: 'WINLOSE', selection: 'HOME', line: null, odds: 1.8 },
        { market: 'WINLOSE', selection: 'AWAY', line: null, odds: 2.0 },
      ]);
    });

    it('MLB 只開勝負：即使回應有 Over/Under 也不入庫', () => {
      const withOu = {
        ...item,
        bookmakers: [
          {
            id: 22,
            bets: [
              { name: 'Home/Away', values: [{ value: 'Home', odd: '1.80' }] },
              { name: 'Over/Under', values: [{ value: 'Over 8.5', odd: '1.90' }] },
            ],
          },
        ],
      };
      const r = parseBaseballOddsItem(withOu, 22, ['WINLOSE']);
      expect(r.quotes.every((q) => q.market === 'WINLOSE')).toBe(true);
    });
  });

  describe('parseFootballFixture', () => {
    it('解析賽程同步欄位', () => {
      const r = parseFootballFixture({
        fixture: { id: 1562344, date: '2026-07-08T19:00:00+00:00', status: { short: 'NS' } },
        teams: { home: { name: 'France' }, away: { name: 'Brazil' } },
      });
      expect(r).toEqual({
        apiFixtureId: 1562344,
        startTime: new Date('2026-07-08T19:00:00+00:00'),
        apiStatus: 'NS',
        homeName: 'France',
        awayName: 'Brazil',
      });
    });
  });
});
