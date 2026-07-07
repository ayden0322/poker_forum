// P幣競猜 — API client 與 React Query hooks
// 慣例沿用 lib/member.ts：queryKey 綁 user.id、apiFetch 自動帶 token、fail-closed 看 enabled。

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useAuth } from '@/context/auth';

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
  lockAt: string;
  winlose: Partial<Record<'HOME' | 'DRAW' | 'AWAY', MarketQuoteView>>;
  overUnder: Array<{ line: number; over?: MarketQuoteView; under?: MarketQuoteView }>;
}

export interface PredictionBoard {
  board: string;
  sportType: 'football' | 'baseball';
  markets: Array<'WINLOSE' | 'OVER_UNDER'>;
}

export interface MyBet {
  betId: string;
  board: string;
  home: string;
  away: string;
  startTime: string;
  market: 'WINLOSE' | 'OVER_UNDER';
  selection: 'HOME' | 'DRAW' | 'AWAY' | 'OVER' | 'UNDER';
  line: number | null;
  stake: number;
  lockedOdds: number;
  potentialPayout: number;
  status: 'PENDING' | 'WON' | 'LOST' | 'PUSH' | 'VOIDED';
  settledAt: string | null;
  createdAt: string;
}

export interface PlaceBetPayload {
  matchId: string;
  market: 'WINLOSE' | 'OVER_UNDER';
  selection: 'HOME' | 'DRAW' | 'AWAY' | 'OVER' | 'UNDER';
  line?: number;
  stake: number;
  quoteId: string;
  clientOdds: number;
  requestId: string;
}

export interface PlaceBetResult {
  betId: string;
  lockedOdds: number;
  line: number | null;
  stake: number;
  potentialPayout: number;
  status: string;
  idempotentReplay: boolean;
}

/** 板塊清單（公開）。enabled=false = 功能未開放（fail-closed，入口不露出） */
export function usePredictionBoards() {
  return useQuery<{ data: { enabled: boolean; boards: PredictionBoard[] } }>({
    queryKey: ['predictions', 'boards'],
    queryFn: () => apiFetch('/predictions/boards'),
    staleTime: 5 * 60_000,
  });
}

/** 單板塊開盤中賽事 + 賠率（公開；未登入看得到）。60 秒輪詢跟上盤口更新。 */
export function usePredictionMarkets(board: string | null) {
  return useQuery<{ data: { enabled: boolean; matches: MatchMarketsView[] } }>({
    queryKey: ['predictions', 'markets', board],
    queryFn: () => apiFetch(`/predictions/markets/${board}`),
    enabled: !!board,
    refetchInterval: 60_000,
  });
}

/** 我的注單（登入限定） */
export function useMyBets() {
  const { user, accessToken } = useAuth();
  return useQuery<{ data: { enabled: boolean; bets: MyBet[] } }>({
    queryKey: ['predictions', 'my-bets', user?.id],
    queryFn: () => apiFetch('/predictions/bets'),
    enabled: !!accessToken && !!user?.id,
    refetchOnWindowFocus: true,
  });
}

/** 下注（錯誤走 ApiError：code=ODDS_CHANGED 時 data 內含新 { quoteId, odds, line }） */
export function placeBet(payload: PlaceBetPayload): Promise<{ data: PlaceBetResult }> {
  return apiFetch('/predictions/bets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ===== 顯示工具（去賭場化語彙，規格 §7.5） =====

export const SELECTION_LABEL: Record<string, string> = {
  HOME: '主勝',
  DRAW: '和局',
  AWAY: '客勝',
  OVER: '大',
  UNDER: '小',
};

export const BET_STATUS_VIEW: Record<MyBet['status'], { label: string; className: string }> = {
  PENDING: { label: '待開賽', className: 'bg-gray-100 text-gray-600' },
  WON: { label: '命中', className: 'bg-[#39B8BE]/10 text-[#2a8d92]' },
  LOST: { label: '未命中', className: 'bg-gray-100 text-gray-500' },
  PUSH: { label: '平盤退回', className: 'bg-gray-100 text-gray-600' },
  VOIDED: { label: '賽事取消退回', className: 'bg-gray-100 text-gray-600' },
};

export function selectionText(bet: Pick<MyBet, 'market' | 'selection' | 'line'>): string {
  if (bet.market === 'OVER_UNDER') return `${SELECTION_LABEL[bet.selection]} ${bet.line}`;
  return SELECTION_LABEL[bet.selection] ?? bet.selection;
}

export function twTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
