// P幣競猜 — 可競猜賽事列表（前端顯示用）
// 回傳「開盤中」賽事 + 各玩法的權威 quote（含 quoteId，前端下注時原樣帶回）。
// 短 TTL Redis 快取（30 秒）：顯示允許小延遲；下注時後端仍以 DB quote + 重驗為權威（規格 §2/§3）。

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { MatchLinkService } from './match-link.service';
import { LOCK_BUFFER_MS } from './prediction.config';
import { PredictionBoardsService } from './prediction-boards.service';
import { isPredictionEnabled } from './prediction.flags';

export interface MarketQuoteView {
  quoteId: string;
  odds: number;
}

export interface MatchMarketsView {
  matchId: string;
  board: string;
  /** 板塊中文名（sports_configs.display_name），彙總列表每張卡要標聯盟用 */
  boardLabel: string;
  sportType: 'football' | 'baseball';
  home: string;
  away: string;
  /** API-Sports 隊徽；沒有 team id 就 null，前端退回縮寫徽章 */
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  startTime: string;
  /** 封盤時間（startTime − buffer），前端倒數與置灰用 */
  lockAt: string;
  /** 站內賽事詳情頁（世界盃有；MLB 對不上 gamePk 為 null，前端 fallback 討論板） */
  detailUrl: string | null;
  winlose: Partial<Record<'HOME' | 'DRAW' | 'AWAY', MarketQuoteView>>;
  overUnder: Array<{ line: number; over?: MarketQuoteView; under?: MarketQuoteView }>;
}

export interface BoardSummaryView {
  board: string;
  displayName: string;
  sportType: 'football' | 'baseball';
  /** 目前開盤中場次數（彙總列表的聯盟篩選顯示用，是賽程數不是參與數） */
  openCount: number;
}

const CACHE_TTL_SEC = 30;
// v2：view 形狀加了 boardLabel / 隊徽欄位，換 key 避免吃到舊快取
const cacheKey = (board: string) => `prediction:markets:v2:${board}`;

/** 各運動的 team id 空間各自獨立，URL 一定要帶 sportType */
export function teamLogoUrl(sportType: 'football' | 'baseball', teamId: number | null): string | null {
  return teamId ? `https://media.api-sports.io/${sportType}/teams/${teamId}.png` : null;
}

@Injectable()
export class MarketsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private matchLink: MatchLinkService,
    private boardsCfg: PredictionBoardsService,
  ) {}

  /** 板塊清單（前端導覽用）。改讀後台設定，管理者開關即時生效。 */
  async boards() {
    const bs = await this.boardsCfg.enabled();
    return bs.map((b) => ({
      board: b.boardSlug,
      displayName: b.displayName,
      sportType: b.sportType,
      markets: b.markets,
    }));
  }

  /** 單板塊開盤中賽事 + 賠率 */
  async openMatches(boardSlug: string): Promise<{ enabled: boolean; matches: MatchMarketsView[] }> {
    if (!isPredictionEnabled()) return { enabled: false, matches: [] };
    const board = await this.boardsCfg.bySlug(boardSlug);
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
        // 「有盤」條件放在 take 之前：否則最早 30 場都還沒開盤時，第 31 場有盤也會被截掉、整板回零場
        quotes: { some: { active: true, bookmakerId: board.bookmakerId } },
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

    const matches: MatchMarketsView[] = (await Promise.all(rows.map(async (m) => {
        const detailUrl = await this.matchLink.detailUrl(boardSlug, m.homeName, m.startTime);
        return { row: m, detailUrl };
      })))
      .map(({ row: m, detailUrl }) => {
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
          boardLabel: board.displayName,
          sportType: board.sportType,
          detailUrl,
          home: m.homeName,
          away: m.awayName,
          homeLogoUrl: teamLogoUrl(board.sportType, m.homeTeamId),
          awayLogoUrl: teamLogoUrl(board.sportType, m.awayTeamId),
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

  /**
   * 全部板塊開盤中賽事（前端預設「全部聯盟、依開賽時間排」用）。
   * 重用單板塊查詢與其 30 秒快取；總量有上限（每板最多 30 場），所以日期分組與聯盟篩選交給前端做。
   * 單一板塊失敗不拖垮整頁：該板塊記進 unavailableBoards，前端要顯示「暫時無法取得」而不是當成零場。
   */
  async openMatchesAll(): Promise<{
    enabled: boolean;
    matches: MatchMarketsView[];
    boards: BoardSummaryView[];
    unavailableBoards: string[];
  }> {
    if (!isPredictionEnabled()) return { enabled: false, matches: [], boards: [], unavailableBoards: [] };
    const cfgs = await this.boardsCfg.enabled();
    const results = await Promise.allSettled(cfgs.map((b) => this.openMatches(b.boardSlug)));

    const matches: MatchMarketsView[] = [];
    const boards: BoardSummaryView[] = [];
    const unavailableBoards: string[] = [];
    cfgs.forEach((b, i) => {
      const r = results[i];
      if (r.status === 'rejected') {
        unavailableBoards.push(b.boardSlug);
        boards.push({ board: b.boardSlug, displayName: b.displayName, sportType: b.sportType, openCount: 0 });
        return;
      }
      matches.push(...r.value.matches);
      boards.push({ board: b.boardSlug, displayName: b.displayName, sportType: b.sportType, openCount: r.value.matches.length });
    });

    // 同時開賽再以板塊、賽事 id 定序，避免每次刷新順序跳動
    matches.sort(
      (a, b) =>
        a.startTime.localeCompare(b.startTime) || a.board.localeCompare(b.board) || a.matchId.localeCompare(b.matchId),
    );
    return { enabled: true, matches, boards, unavailableBoards };
  }
}
