import { classifyStatus, decideOutcome } from './settlement-rules';

describe('settlement-rules', () => {
  describe('decideOutcome — 勝負盤', () => {
    it('足球三選一：主勝/平局/客勝各自對應', () => {
      expect(decideOutcome('football', 'WINLOSE', 'HOME', null, 2, 1)).toBe('WON');
      expect(decideOutcome('football', 'WINLOSE', 'AWAY', null, 2, 1)).toBe('LOST');
      expect(decideOutcome('football', 'WINLOSE', 'DRAW', null, 2, 1)).toBe('LOST');
      expect(decideOutcome('football', 'WINLOSE', 'DRAW', null, 1, 1)).toBe('WON'); // 平局=押和的贏
      expect(decideOutcome('football', 'WINLOSE', 'HOME', null, 1, 1)).toBe('LOST'); // 足球平局押主=輸，不是退
    });

    it('棒球二選一：平局 → PUSH 退本（沒有 DRAW 選項可押）', () => {
      expect(decideOutcome('baseball', 'WINLOSE', 'HOME', null, 5, 3)).toBe('WON');
      expect(decideOutcome('baseball', 'WINLOSE', 'AWAY', null, 5, 3)).toBe('LOST');
      expect(decideOutcome('baseball', 'WINLOSE', 'HOME', null, 4, 4)).toBe('PUSH');
      expect(decideOutcome('baseball', 'WINLOSE', 'AWAY', null, 4, 4)).toBe('PUSH');
    });
  });

  describe('decideOutcome — 大小分', () => {
    it('總分 vs 盤口線', () => {
      expect(decideOutcome('football', 'OVER_UNDER', 'OVER', 2.5, 2, 1)).toBe('WON'); // 3 > 2.5
      expect(decideOutcome('football', 'OVER_UNDER', 'UNDER', 2.5, 2, 1)).toBe('LOST');
      expect(decideOutcome('football', 'OVER_UNDER', 'UNDER', 2.5, 1, 1)).toBe('WON'); // 2 < 2.5
    });

    it('整數盤口線剛好等於 → PUSH 退本（規格 §0 結算口徑）', () => {
      expect(decideOutcome('baseball', 'OVER_UNDER', 'OVER', 8, 5, 3)).toBe('PUSH'); // 8 == 8
      expect(decideOutcome('baseball', 'OVER_UNDER', 'UNDER', 8, 5, 3)).toBe('PUSH');
    });

    it('缺盤口線 → 拋錯（防禦性，收單已擋）', () => {
      expect(() => decideOutcome('football', 'OVER_UNDER', 'OVER', null, 1, 0)).toThrow();
    });
  });

  describe('classifyStatus — 賽況白名單', () => {
    it('足球：完賽三態、取消/技術判定、延賽、進行中', () => {
      expect(classifyStatus('football', 'FT')).toBe('FINAL');
      expect(classifyStatus('football', 'AET')).toBe('FINAL');
      expect(classifyStatus('football', 'PEN')).toBe('FINAL');
      expect(classifyStatus('football', 'CANC')).toBe('VOID');
      expect(classifyStatus('football', 'AWD')).toBe('VOID'); // 技術判給：非競技比分，一律退款
      expect(classifyStatus('football', 'PST')).toBe('FREEZE');
      expect(classifyStatus('football', 'SUSP')).toBe('WAIT');
      expect(classifyStatus('football', '1H')).toBe('WAIT');
    });

    it('棒球：局數狀態（INx）視為進行中', () => {
      expect(classifyStatus('baseball', 'FT')).toBe('FINAL');
      expect(classifyStatus('baseball', 'POST')).toBe('FREEZE');
      expect(classifyStatus('baseball', 'INTR')).toBe('FREEZE');
      expect(classifyStatus('baseball', 'IN1')).toBe('WAIT');
      expect(classifyStatus('baseball', 'IN9')).toBe('WAIT');
      expect(classifyStatus('baseball', 'IN12')).toBe('WAIT'); // 延長局
    });

    it('白名單外 → UNKNOWN（絕不 default 當完賽；red-team C 刀核心防線）', () => {
      expect(classifyStatus('football', 'WEIRD_NEW_STATUS')).toBe('UNKNOWN');
      expect(classifyStatus('baseball', '')).toBe('UNKNOWN');
    });
  });
});
