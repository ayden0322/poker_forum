'use client';

// P幣競猜 — Bet Slip（兩步制 bottom sheet，設計規格 §7.1-7.3；design-mentor 驗收修正版）
// 鐵律：
//   - 點賠率零後果，風險全集中在唯一確認鍵上；確認鍵文案永遠印著鎖定賠率
//   - 賠率變動不准靜默換值：ODDS_CHANGED → 整顆鍵變 acknowledge（header 舊價劃掉、新價並列）
//   - 拒單是狀態不是錯誤：不用 error toast、不清空選擇與金額
//   - 去賭場化：語彙用競猜/命中/拿回；無 confetti 無金光；輸贏色 = 青綠/中性灰

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/context/auth';
import { useMemberSummary } from '@/lib/member';
import { teamZh } from '@/components/predictions/TeamLabel';
import {
  MatchMarketsView,
  MarketQuoteView,
  PlaceBetResult,
  placeBet,
  SELECTION_LABEL,
  twTime,
} from '@/lib/predictions';

export interface SlipSelection {
  match: MatchMarketsView;
  market: 'WINLOSE' | 'OVER_UNDER';
  selection: 'HOME' | 'DRAW' | 'AWAY' | 'OVER' | 'UNDER';
  line: number | null;
  quote: MarketQuoteView;
}

type SlipPhase =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'oddsChanged'; from: number; to: MarketQuoteView & { line: number | null } }
  | { kind: 'feedDown' }
  | { kind: 'locked' }
  | { kind: 'notice'; message: string }
  | { kind: 'done'; result: PlaceBetResult };

const CHIPS = [100, 500, 1000];

export default function BetSlip({
  selection,
  onClose,
}: {
  selection: SlipSelection | null;
  onClose: () => void;
}) {
  const { requireLogin } = useAuth();
  const queryClient = useQueryClient();
  const { data: memberData } = useMemberSummary();
  const [stake, setStake] = useState<number | null>(500);
  const [customMode, setCustomMode] = useState(false);
  const [phase, setPhase] = useState<SlipPhase>({ kind: 'idle' });
  // ODDS_CHANGED 後的權威新價（蓋過 props 的舊顯示值）
  const [override, setOverride] = useState<(MarketQuoteView & { line: number | null }) | null>(null);
  const requestIdRef = useRef<string>('');

  const active = selection
    ? {
        ...selection,
        quote: override ?? selection.quote,
        line: override ? override.line : selection.line,
      }
    : null;

  // 換場次/選項 → 重置（金額保留是「同場次內」的原則；跨場次重置回預設）
  const selectionKey = selection ? `${selection.match.matchId}:${selection.market}:${selection.selection}:${selection.line}` : '';
  useEffect(() => {
    setPhase({ kind: 'idle' });
    setOverride(null);
  }, [selectionKey]);

  // 請求冪等鍵：同一組（場次/選項/金額/賠率）共用；任何一項變了就換新（重送保護只給「同一筆意圖」）
  const intentKey = active ? `${selectionKey}:${stake}:${active.quote.odds}` : '';
  useMemo(() => {
    requestIdRef.current = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentKey]);

  const member = memberData?.data;
  const pBalance = member && member.enabled ? (member as { p?: number }).p : undefined;
  const odds = active?.quote.odds ?? 0;
  const payout = active && stake ? Math.floor(stake * odds) : 0;
  const selLabel = active
    ? active.market === 'OVER_UNDER'
      ? `${SELECTION_LABEL[active.selection]} ${active.line}`
      : SELECTION_LABEL[active.selection]
    : '';

  const submit = async () => {
    if (!active) return;
    if (!requireLogin()) return;
    if (!stake || stake <= 0) return;
    setPhase({ kind: 'submitting' });
    try {
      const res = await placeBet({
        matchId: active.match.matchId,
        market: active.market,
        selection: active.selection,
        line: active.line ?? undefined,
        stake,
        quoteId: active.quote.quoteId,
        clientOdds: odds,
        requestId: requestIdRef.current,
      });
      setPhase({ kind: 'done', result: res.data });
      queryClient.invalidateQueries({ queryKey: ['predictions', 'my-bets'] });
      queryClient.invalidateQueries({ queryKey: ['member'] }); // P 幣餘額
    } catch (e) {
      if (e instanceof ApiError) {
        const data = (e.data ?? {}) as { quoteId?: string; odds?: number; line?: number | null };
        switch (e.code) {
          case 'ODDS_CHANGED':
            if (data.quoteId && typeof data.odds === 'number') {
              setPhase({ kind: 'oddsChanged', from: odds, to: { quoteId: data.quoteId, odds: data.odds, line: data.line ?? active.line } });
            } else {
              setPhase({ kind: 'notice', message: '賠率已更新，請重新確認' });
            }
            queryClient.invalidateQueries({ queryKey: ['predictions', 'markets'] });
            return;
          case 'STALE_ODDS':
            setPhase({ kind: 'notice', message: '賠率剛更新，請再按一次確認' });
            queryClient.invalidateQueries({ queryKey: ['predictions', 'markets'] });
            return;
          case 'FEED_DOWN':
            setPhase({ kind: 'feedDown' });
            return;
          case 'MARKET_LOCKED':
            setPhase({ kind: 'locked' });
            return;
          case 'INSUFFICIENT_BALANCE':
            setPhase({ kind: 'notice', message: 'P 幣餘額不足——完成每日任務賺 G 幣，即可兌換 P 幣' });
            return;
          case 'LIMIT_EXCEEDED':
            setPhase({ kind: 'notice', message: e.message || '超過本場競猜上限' });
            return;
          case 'PREDICTION_DISABLED':
            onClose();
            return;
          default:
            setPhase({ kind: 'notice', message: e.message || '暫時無法受理，請稍後再試' });
            return;
        }
      }
      setPhase({ kind: 'notice', message: '連線異常，請稍後再試' });
    }
  };

  const acknowledgeNewOdds = () => {
    if (phase.kind !== 'oddsChanged') return;
    setOverride(phase.to);
    setPhase({ kind: 'idle' });
  };

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="betslip"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%', transition: { type: 'tween', duration: 0.15 } }}
            transition={{ type: 'tween', duration: 0.22 }}
            className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 pb-8 sm:pb-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 場次與選項（oddsChanged 時舊價劃掉、新價並列——同屏不留兩個「現行價」） */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-gray-500">
                  {teamZh(active.match.home)} vs {teamZh(active.match.away)} · {twTime(active.match.startTime)}
                </div>
                <div className="mt-1 text-lg font-bold text-gray-900">
                  {selLabel}
                  {phase.kind === 'oddsChanged' ? (
                    <>
                      <span className="ml-2 font-mono-stadium tabular-nums line-through text-gray-400">@{odds}</span>
                      <span className="ml-1.5 font-mono-stadium tabular-nums text-[#2a8d92]">@{phase.to.odds}</span>
                    </>
                  ) : (
                    <span className="ml-2 font-mono-stadium tabular-nums text-[#2a8d92]">@{odds}</span>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 -m-2 text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="關閉"
              >
                ×
              </button>
            </div>

            {phase.kind === 'done' ? (
              /* 成功態：數字自己講，無特效（§7.4） */
              <div className="mt-6 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-[#39B8BE] text-white flex items-center justify-center text-2xl">✓</div>
                <div className="mt-3 text-gray-900 font-bold">
                  已投入 <span className="font-mono-stadium tabular-nums">{phase.result.stake}</span> P
                </div>
                <div className="mt-1 text-sm text-gray-500">
                  命中可拿回 <span className="font-mono-stadium tabular-nums text-[#2a8d92] font-bold">{phase.result.potentialPayout}</span> P（鎖定 @{phase.result.lockedOdds}）
                </div>
                <button onClick={onClose} className="mt-5 w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-medium hover:bg-gray-200">
                  完成
                </button>
              </div>
            ) : (
              <>
                {/* 金額（餘額可見；超額 chip 直接不可點——與 ExchangePanel 同行為） */}
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-gray-500">投入金額</span>
                  {pBalance !== undefined && (
                    <span className="text-xs text-gray-400">
                      餘額 <span className="font-mono-stadium tabular-nums">{pBalance}</span> P
                    </span>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  {CHIPS.map((c) => (
                    <button
                      key={c}
                      onClick={() => { setStake(c); setCustomMode(false); }}
                      disabled={pBalance !== undefined && c > pBalance}
                      className={`flex-1 py-2 rounded-lg border text-sm font-mono-stadium tabular-nums transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        !customMode && stake === c
                          ? 'bg-[#39B8BE] border-[#39B8BE] text-white'
                          : 'border-gray-200 text-gray-700 hover:border-[#39B8BE]/60'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                  <button
                    onClick={() => setCustomMode(true)}
                    className={`flex-1 py-2 rounded-lg border text-sm ${customMode ? 'bg-[#39B8BE] border-[#39B8BE] text-white' : 'border-gray-200 text-gray-700 hover:border-[#39B8BE]/60'}`}
                  >
                    自訂
                  </button>
                </div>
                {customMode && (
                  <input
                    type="number"
                    inputMode="numeric"
                    min={100}
                    step={100}
                    value={stake ?? ''}
                    onChange={(e) => setStake(e.target.value ? Number(e.target.value) : null)}
                    placeholder="輸入 P 幣數量"
                    className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono-stadium tabular-nums focus:outline-none focus:border-[#39B8BE]"
                  />
                )}

                {/* 算式行 = 內建教學（§7.1） */}
                <div className="mt-3 text-sm text-gray-500">
                  可拿回{' '}
                  <span className="font-mono-stadium tabular-nums text-gray-900 font-bold">{payout || '—'}</span> P ={' '}
                  <span className="font-mono-stadium tabular-nums">{stake || '—'} × {odds}</span>（含本金）
                </div>
                {active.market === 'OVER_UNDER' && Number.isInteger(active.line) && (
                  <div className="mt-1 text-xs text-gray-400">兩隊總分剛好 {active.line} 時退回本金</div>
                )}

                {/* 提示列（拒單是狀態，選擇永遠保留） */}
                {phase.kind === 'notice' && <div className="mt-3 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{phase.message}</div>}
                {phase.kind === 'feedDown' && (
                  <div className="mt-3 text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">賠率來源暫時中斷，競猜暫停受理，你的選擇會保留</div>
                )}

                {/* 唯一確認鍵（文案印鎖定賠率；變動 → acknowledge） */}
                <div className="mt-4">
                  {phase.kind === 'oddsChanged' ? (
                    <div className="space-y-2">
                      <div className="text-sm text-center text-gray-600">
                        賠率已更新 <span className="font-mono-stadium tabular-nums">{phase.from}</span> →{' '}
                        <span className="font-mono-stadium tabular-nums font-bold text-gray-900">{phase.to.odds}</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={acknowledgeNewOdds} className="flex-1 py-3 rounded-xl bg-[#39B8BE] text-white font-bold hover:opacity-90">
                          以 @{phase.to.odds} 繼續
                        </button>
                        <button onClick={onClose} className="px-5 py-3 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200">
                          取消
                        </button>
                      </div>
                    </div>
                  ) : phase.kind === 'locked' ? (
                    <button disabled className="w-full py-3 rounded-xl bg-gray-100 text-gray-400 font-bold cursor-not-allowed">
                      已封盤
                    </button>
                  ) : (
                    <button
                      onClick={submit}
                      disabled={phase.kind === 'submitting' || phase.kind === 'feedDown' || !stake || stake <= 0}
                      className="w-full py-3 rounded-xl bg-[#39B8BE] text-white font-bold hover:opacity-90 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                    >
                      {phase.kind === 'submitting' ? '送出中…' : phase.kind === 'feedDown' ? '暫停受理' : `確認競猜 @${odds}`}
                    </button>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
