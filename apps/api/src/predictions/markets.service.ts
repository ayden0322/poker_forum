// P幣競猜 — 可競猜賽事列表（前端顯示用）
// 回傳「開盤中」賽事 + 各玩法的權威 quote（含 quoteId，前端下注時原樣帶回）。
// 短 TTL Redis 快取（30 秒）：顯示允許小延遲；下注時後端仍以 DB quote + 重驗為權威（規格 §2/§3）。

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { enabledBoards, LOCK_BUFFER_MS, PREDICTION_BOARDS } from './prediction.config';
import { isPredictionEnabled } from './prediction.flags';

export interface MarketQuoteView {
  quoteId: string;
  odds: number;
}

export interface MatchMarketsView {
  matchId: string;
  board: string;
  home: string;
  away: string;
  startTime: string;
  /** 封盤時間（startTime − buffer），前端倒數與置灰用 */
  lockAt: string;
  winlose: Partial<Record<'HOME' | 'DRAW' | 'AWAY', MarketQuoteView>>;
  overUnder: Array<{ line: number; over?: MarketQuoteView; under?: MarketQuoteView }>;
}

const CACHE_TTL_SEC = 30;
const cacheKey = (board: string) => `prediction:markets:${board}`;

@Injectable()
export class MarketsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /** 板塊清單（前端導覽用） */
  boards() {
    return enabledBoards().map((b) => ({ board: b.boardSlug, sportType: b.sportType, markets: b.markets }));
  }

  /** 單板塊開盤中賽事 + 賠率 */
  async openMatches(boardSlug: string): Promise<{ enabled: boolean; matches: MatchMarketsView[] }> {
    if (!isPredictionEnabled()) return { enabled: false, matches: [] };
    const board = PREDICTION_BOARDS[boardSlug];
    if (!board?.enabled) return { enabled: false, matches: [] };

    const cached = await this.redis.get<MatchMarketsView[]>(cacheKey(boardSlug));
    if (cached) return { enabled: true, matches: cached };

    const rows = await this.prisma.predictionMatch.findMany({
      where: {
        boardSlug,
        apiStatus: 'NS',
        settledAt: null,
        frozenAt: null,
        startTime: { gt: new Date(Date.now() + LOCK_BUFFER_MS) }, // 已進封盤 buffer 的不再列出
      },
      orderBy: { startTime: 'asc' },
      take: 30,
      include: {
        quotes: {
          where: { active: true, bookmakerId: board.bookmakerId },
          select: { id: true, market: true, selection: true, line: true, odds: true },
        },
      },
    });

    const matches: MatchMarketsView[] = rows
      .map((m) => {
        const winlose: MatchMarketsView['winlose'] = {};
        const ouByLine = new Map<number, MatchMarketsView['overUnder'][number]>();
        for (const q of m.quotes) {
          const view: MarketQuoteView = { quoteId: q.id, odds: q.odds.toNumber() };
          if (q.market === 'WINLOSE') {
            winlose[q.selection as 'HOME' | 'DRAW' | 'AWAY'] = view;
          } else if (q.line !== null) {
            const line = q.line.toNumber();
            const entry = ouByLine.get(line) ?? { line };
            if (q.selection === 'OVER') entry.over = view;
            if (q.selection === 'UNDER') entry.under = view;
            ouByLine.set(line, entry);
          }
        }
        return {
          matchId: m.id,
          board: boardSlug,
          home: m.homeName,
          away: m.awayName,
          startTime: m.startTime.toISOString(),
          lockAt: new Date(m.startTime.getTime() - LOCK_BUFFER_MS).toISOString(),
          winlose,
          overUnder: [...ouByLine.values()].sort((a, b) => a.line - b.line),
        };
      })
      // 沒有任何盤的賽事不列（規格：完全無盤口不開放預測）
      .filter((m) => Object.keys(m.winlose).length > 0 || m.overUnder.length > 0);

    await this.redis.set(cacheKey(boardSlug), matches, CACHE_TTL_SEC);
    return { enabled: true, matches };
  }
}
