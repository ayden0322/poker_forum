'use client';

// P幣競猜中心（設計規格 §7）
// - 賠率格即入口：點賠率 → bottom sheet（兩步制，點格零後果）
// - 未登入看得到盤（點下注才撞登入牆——「看得到玩不到」註冊鉤）
// - fail-closed：enabled=false 導回首頁（比照 member-center）
// - 我的競猜：贏=青綠、輸=中性灰；主角是選項與命中，不是金額

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth';
import {
  BET_STATUS_VIEW,
  MatchMarketsView,
  SELECTION_LABEL,
  selectionText,
  twTime,
  useMyBets,
  usePredictionBoards,
  usePredictionMarkets,
} from '@/lib/predictions';
import BetSlip, { SlipSelection } from '@/components/predictions/BetSlip';
import Leaderboard from '@/components/predictions/Leaderboard';

const BOARD_LABEL: Record<string, string> = {
  'world-cup': '世界盃',
  mlb: 'MLB',
};

function OddsCell({
  label,
  odds,
  selected,
  onClick,
}: {
  label: string;
  odds?: number;
  selected: boolean;
  onClick: () => void;
}) {
  if (odds === undefined) {
    return <div className="flex-1 py-2.5 rounded-lg border border-gray-100 text-center text-gray-300 text-sm">—</div>;
  }
  return (
    <button
      onClick={onClick}
      className={`flex-1 min-h-[44px] py-2 rounded-lg border text-center transition-colors ${
        selected ? 'bg-[#39B8BE] border-[#39B8BE] text-white' : 'border-gray-200 bg-white hover:border-[#39B8BE]/60'
      }`}
    >
      <div className={`text-xs ${selected ? 'text-white/80' : 'text-gray-500'}`}>{label}</div>
      <div className={`font-mono-stadium tabular-nums font-bold ${selected ? 'text-white' : 'text-gray-900'}`}>{odds}</div>
    </button>
  );
}

function MatchCard({
  m,
  slip,
  onPick,
}: {
  m: MatchMarketsView;
  slip: SlipSelection | null;
  onPick: (s: SlipSelection) => void;
}) {
  // 主要大小分線：取最中間那條（各家主線通常在中位）
  const mainOu = m.overUnder.length ? m.overUnder[Math.floor(m.overUnder.length / 2)] : null;
  const isSel = (market: string, selection: string, line: number | null) =>
    !!slip &&
    slip.match.matchId === m.matchId &&
    slip.market === market &&
    slip.selection === selection &&
    slip.line === line;

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm">
        <div className="font-medium text-gray-900">
          {m.home} <span className="text-gray-400">vs</span> {m.away}
        </div>
        <div className="text-gray-400">{twTime(m.startTime)}</div>
      </div>

      {/* 勝負盤 */}
      {Object.keys(m.winlose).length > 0 && (
        <div className="mt-3 flex gap-2">
          {(['HOME', 'DRAW', 'AWAY'] as const).map((sel) =>
            m.winlose[sel] || sel !== 'DRAW' ? (
              <OddsCell
                key={sel}
                label={SELECTION_LABEL[sel]}
                odds={m.winlose[sel]?.odds}
                selected={isSel('WINLOSE', sel, null)}
                onClick={() =>
                  m.winlose[sel] &&
                  onPick({ match: m, market: 'WINLOSE', selection: sel, line: null, quote: m.winlose[sel]! })
                }
              />
            ) : null,
          )}
        </div>
      )}

      {/* 大小分（主線） */}
      {mainOu && (
        <div className="mt-2 flex gap-2 items-center">
          <div className="text-xs text-gray-400 w-14 shrink-0">總分 {mainOu.line}</div>
          <OddsCell
            label={`大 ${mainOu.line}`}
            odds={mainOu.over?.odds}
            selected={isSel('OVER_UNDER', 'OVER', mainOu.line)}
            onClick={() =>
              mainOu.over && onPick({ match: m, market: 'OVER_UNDER', selection: 'OVER', line: mainOu.line, quote: mainOu.over })
            }
          />
          <OddsCell
            label={`小 ${mainOu.line}`}
            odds={mainOu.under?.odds}
            selected={isSel('OVER_UNDER', 'UNDER', mainOu.line)}
            onClick={() =>
              mainOu.under && onPick({ match: m, market: 'OVER_UNDER', selection: 'UNDER', line: mainOu.line, quote: mainOu.under })
            }
          />
        </div>
      )}
    </div>
  );
}

function MyBetsSection() {
  const { user } = useAuth();
  const { data } = useMyBets();
  if (!user) return null;
  const bets = data?.data.bets ?? [];
  if (!data?.data.enabled || bets.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-base font-bold text-gray-900 mb-3">我的競猜</h2>
      <div className="space-y-2">
        {bets.map((b) => {
          const sv = BET_STATUS_VIEW[b.status];
          return (
            <div key={b.betId} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {b.home} vs {b.away}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {selectionText(b)} <span className="font-mono-stadium tabular-nums">@{b.lockedOdds}</span> · 投入{' '}
                  <span className="font-mono-stadium tabular-nums">{b.stake}</span> P · {twTime(b.startTime)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${sv.className}`}>{sv.label}</span>
                {b.status === 'WON' && (
                  <div className="mt-1 text-sm font-mono-stadium tabular-nums font-bold text-[#2a8d92]">+{b.potentialPayout} P</div>
                )}
                {b.status === 'PENDING' && (
                  <div className="mt-1 text-xs text-gray-400">
                    命中拿回 <span className="font-mono-stadium tabular-nums">{b.potentialPayout}</span> P
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function PredictionsClient() {
  const router = useRouter();
  const { requireLogin } = useAuth();
  const { data: boardsData, isLoading: boardsLoading } = usePredictionBoards();
  const boards = useMemo(() => boardsData?.data.boards ?? [], [boardsData]);
  const enabled = boardsData?.data.enabled;
  const [board, setBoard] = useState<string | null>(null);
  const [slip, setSlip] = useState<SlipSelection | null>(null);
  const [view, setView] = useState<'markets' | 'leaderboard'>('markets');

  useEffect(() => {
    if (!board && boards.length) setBoard(boards[0].board);
  }, [boards, board]);
  // fail-closed：功能未開放導回首頁（比照 member-center）
  useEffect(() => {
    if (enabled === false) router.replace('/');
  }, [enabled, router]);

  const { data: marketsData, isLoading } = usePredictionMarkets(board);
  const matches = marketsData?.data.matches ?? [];

  if (enabled === false) return null;

  const pick = (s: SlipSelection) => {
    if (!requireLogin()) return; // 未登入：看得到盤，點了才撞登入牆
    setSlip(s);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900">賽事競猜</h1>
      <p className="mt-1 text-sm text-gray-500">賽前用 P 幣競猜，開賽即封盤，賠率在你確認當下鎖定。</p>

      {/* 主視圖切換：盤口 / 排行榜 */}
      <div className="mt-4 flex gap-2 border-b border-gray-100 pb-3">
        <button
          onClick={() => setView('markets')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            view === 'markets' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'
          }`}
        >
          競猜盤口
        </button>
        <button
          onClick={() => setView('leaderboard')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            view === 'leaderboard' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'
          }`}
        >
          排行榜
        </button>
      </div>

      {view === 'leaderboard' ? (
        <div className="mt-4">
          <Leaderboard />
        </div>
      ) : (
        <>
          {/* 板塊切換 */}
          <div className="mt-4 flex gap-2">
            {boards.map((b) => (
              <button
                key={b.board}
                onClick={() => setBoard(b.board)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  board === b.board ? 'bg-[#39B8BE] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-[#39B8BE]/60'
                }`}
              >
                {BOARD_LABEL[b.board] ?? b.board}
              </button>
            ))}
          </div>

          {/* 賽事列表 */}
          <div className="mt-4 space-y-3">
            {boardsLoading || isLoading ? (
              <div className="text-center text-sm text-gray-400 py-10">載入盤口中…</div>
            ) : matches.length === 0 ? (
              <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
                目前沒有可競猜的賽事，開賽前會陸續開盤
              </div>
            ) : (
              matches.map((m) => <MatchCard key={m.matchId} m={m} slip={slip} onPick={pick} />)
            )}
          </div>

          <MyBetsSection />
        </>
      )}

      {slip && <BetSlip selection={slip} onClose={() => setSlip(null)} />}
    </div>
  );
}
