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
  /** 站內賽事詳情頁（世界盃有；無法對應為 null → 前端 fallback 討論板） */
  detailUrl: string | null;
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
  detailUrl: string | null;
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

export type LeaderboardType = 'profit' | 'winrate';

export interface LeaderboardRow {
  rank: number;
  nickname: string;
  profit: number; // 獲利榜主指標
  winRate: number; // 勝率榜主指標
  n: number; // 已結算場次
  avgOdds: number; // 勝率榜同列顯示
}

/** 排行榜（公開）：type=profit 獲利榜 / winrate 勝率榜；滿 30 場入榜 */
export function usePredictionLeaderboard(period: 'week' | 'month', type: LeaderboardType = 'profit') {
  return useQuery<{
    data: { enabled: boolean; periodStart: string; type: LeaderboardType; minSettled: number; rows: LeaderboardRow[] };
  }>({
    queryKey: ['predictions', 'leaderboard', period, type],
    queryFn: () => apiFetch(`/predictions/leaderboard?period=${period}&type=${type}`),
    staleTime: 5 * 60_000,
  });
}

export interface RecordBet {
  board: string;
  detailUrl: string | null; home: string; away: string; startTime: string;
  market: 'WINLOSE' | 'OVER_UNDER'; selection: MyBet['selection']; line: number | null;
  lockedOdds: number; status: 'PENDING' | 'WON' | 'LOST' | 'PUSH';
}

export interface PublicRecord {
  enabled: boolean;
  found?: boolean;
  nickname?: string;
  stats?: { n: number; winRate: number; avgOdds: number };
  /** 進行中（賽前公開曬單；不含金額） */
  pending?: RecordBet[];
  recent?: RecordBet[];
}

/** 公開戰績（不含金額——曬的是預測不是錢） */
export function usePublicRecord(nickname: string | null) {
  return useQuery<{ data: PublicRecord }>({
    queryKey: ['predictions', 'record', nickname],
    queryFn: () => apiFetch(`/predictions/record/${encodeURIComponent(nickname!)}`),
    enabled: !!nickname,
    staleTime: 60_000,
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

/** 賽事資訊連結：詳情頁優先，對不上就去該板討論區 */
export function matchInfoUrl(b: { detailUrl: string | null; board: string }): string {
  return b.detailUrl ?? `/board/${b.board}`;
}

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
    hour12: false, // 與世界盃 widget 對齊（design P2-D）
  });
}

/** 只取時分（日期已在分組標顯示時用） */
export function twClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** 台北日期 key（分組用）+ 顯示標（7/8（週三）） */
export function twDateGroup(iso: string): { key: string; label: string } {
  const d = new Date(iso);
  const key = d.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' });
  const weekday = d.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'short' });
  return { key, label: `${key}（${weekday}）` };
}
