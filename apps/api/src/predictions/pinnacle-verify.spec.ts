// 莊家盤口實測（打真實 API-Sports，會消耗額度）：驗證某莊家在各聯盟實際開了哪些玩法。
//
// 預設 skip —— 這支依賴外部網路與 API 額度，不該進 CI 熱路徑。要跑得顯式開：
//   RUN_LIVE_ODDS_CHECK=1 API_SPORTS_KEY=xxx npx jest pinnacle-verify
//   反向證明（應全紅）：… BOOKMAKER=22 npx jest pinnacle-verify
//
// 2026-08-02 實測結論：WilliamHill(22) 三聯盟大小分全為 0（這就是競猜頁「單薄」的根因），
// 換 Pinnacle(4) 後 MLB/KBO/NPB 全部解得出 OVER_UNDER，且現有 parser 零改動。
// 未來要換莊家或加聯盟時，先跑這支確認資料源真的有盤，再動後台設定。
import { parseBaseballOddsItem } from './odds-parsers';

const KEY = process.env.API_SPORTS_KEY ?? '';
// 預設 Pinnacle(4)；反向證明時用 BOOKMAKER=22（WilliamHill）跑，大小分應為 0 → 測試必須變紅
const BOOKMAKER = Number(process.env.BOOKMAKER ?? 4);
const LEAGUES = [
  { id: 1, name: 'MLB' },
  { id: 5, name: 'KBO' },
  { id: 2, name: 'NPB' },
];

async function fetchOdds(leagueId: number) {
  const url = `https://v1.baseball.api-sports.io/odds?league=${leagueId}&season=2026&bookmaker=${BOOKMAKER}`;
  const res = await fetch(url, { headers: { 'x-apisports-key': KEY } });
  const json = (await res.json()) as { response?: unknown[] };
  return json.response ?? [];
}

const LIVE = process.env.RUN_LIVE_ODDS_CHECK === '1';

(LIVE ? describe : describe.skip)('莊家盤口實測：現有解析器能否解出大小分', () => {
  for (const lg of LEAGUES) {
    it(`${lg.name} 解析出 WINLOSE 與 OVER_UNDER 兩種玩法`, async () => {
      expect(KEY).not.toBe('');
      const items = await fetchOdds(lg.id);
      expect(items.length).toBeGreaterThan(0);

      let matches = 0;
      let winlose = 0;
      let overUnder = 0;
      const ouLines = new Set<number>();
      let sample: { homeName: string | null; awayName: string | null; quotes: unknown[] } | null = null;

      for (const item of items) {
        const parsed = parseBaseballOddsItem(item as never, BOOKMAKER, ['WINLOSE', 'OVER_UNDER']);
        if (!parsed) continue;
        matches++;
        for (const q of parsed.quotes) {
          if (q.market === 'WINLOSE') winlose++;
          if (q.market === 'OVER_UNDER') {
            overUnder++;
            if (q.line !== null) ouLines.add(q.line);
          }
        }
        if (!sample && parsed.quotes.some((q) => q.market === 'OVER_UNDER')) sample = parsed;
      }

      // eslint-disable-next-line no-console
      console.log(
        `\n[${lg.name}] 原始 ${items.length} 場 → 解析 ${matches} 場｜勝負報價 ${winlose} 筆｜大小分報價 ${overUnder} 筆\n` +
          `[${lg.name}] 大小分盤口線：${[...ouLines].sort((a, b) => a - b).join(', ')}\n` +
          (sample
            ? `[${lg.name}] 範例 ${sample.homeName} vs ${sample.awayName}\n` +
              (sample.quotes as Array<Record<string, unknown>>)
                .slice(0, 6)
                .map((q) => `        ${q.market} / ${q.selection} / line=${q.line} / odds=${q.odds}`)
                .join('\n')
            : ''),
      );

      expect(matches).toBeGreaterThan(0);
      expect(winlose).toBeGreaterThan(0);
      expect(overUnder).toBeGreaterThan(0); // ← 這行是重點：舊莊家 WH 這裡會是 0
      expect(ouLines.size).toBeGreaterThan(0);
    });
  }
});
