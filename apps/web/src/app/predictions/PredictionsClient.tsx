'use client';

// P幣競猜中心（設計規格 §7 + design-mentor 改造方案 2026-07-07）
// - 賽事感不是表單感：三層卡（meta/隊伍/賠率）、國旗與隊徽、日期分組、封盤倒數
// - 桌機雙欄（複用首頁 HomeBaseballHub 網格）：主欄盤口、右欄 sticky rail（我的競猜/週榜Top5/規則）
// - 賠率格 = 入口：青綠大數字 + hover/active 回饋 + 變盤 flash（不分漲跌色）
// - 未登入看得到盤（點下注才撞登入牆）；fail-closed：enabled=false 導回首頁

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth';
import { useMemberSummary } from '@/lib/member';
import {
  BET_STATUS_VIEW,
  MatchMarketsView,
  SELECTION_LABEL,
  selectionText,
  twClock,
  twDateGroup,
  useMyBets,
  usePredictionBoards,
  usePredictionLeaderboard,
  usePredictionMarkets,
  matchInfoUrl,
} from '@/lib/predictions';
import BetSlip, { SlipSelection } from '@/components/predictions/BetSlip';
import TeamLabel from '@/components/predictions/TeamLabel';
import Leaderboard from '@/components/predictions/Leaderboard';

const BOARD_LABEL: Record<string, string> = {
  'world-cup': '世界盃',
  mlb: 'MLB',
};

// ===== 賠率格（P1-G affordance + P2-I 變盤 flash） =====

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
  const prevOdds = useRef<number | undefined>(odds);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (prevOdds.current !== undefined && odds !== undefined && prevOdds.current !== odds) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      return () => clearTimeout(t);
    }
    prevOdds.current = odds;
  }, [odds]);
  useEffect(() => { prevOdds.current = odds; });

  if (odds === undefined) {
    return <div className="flex-1 py-2.5 rounded-lg border border-gray-100 text-center text-gray-300 text-sm">—</div>;
  }
  return (
    <button
      onClick={onClick}
      className={`flex-1 min-h-[44px] py-2 rounded-lg border text-center transition-all cursor-pointer active:scale-[0.98] ${
        selected
          ? 'bg-[#39B8BE] border-[#39B8BE] text-white'
          : `border-gray-200 hover:border-[#39B8BE]/60 hover:bg-[#39B8BE]/5 ${flash ? 'bg-[#39B8BE]/5' : 'bg-gray-50/80'}`
      }`}
    >
      <div className={`text-xs ${selected ? 'text-white/80' : 'text-gray-500'}`}>{label}</div>
      <div className={`text-lg leading-tight font-mono-stadium tabular-nums font-bold ${selected ? 'text-white' : 'text-[#2a8d92]'}`}>
        {odds}
      </div>
    </button>
  );
}

// ===== 賽事卡（P1-F 三層 + P2-H 封盤倒數 + P2-M 命中拿回提示） =====

function MatchCard({
  m,
  slip,
  onPick,
}: {
  m: MatchMarketsView;
  slip: SlipSelection | null;
  onPick: (s: SlipSelection) => void;
}) {
  const mainOu = m.overUnder.length ? m.overUnder[Math.floor(m.overUnder.length / 2)] : null;
  const isSel = (market: string, selection: string, line: number | null) =>
    !!slip &&
    slip.match.matchId === m.matchId &&
    slip.market === market &&
    slip.selection === selection &&
    slip.line === line;
  const selectedHere = !!slip && slip.match.matchId === m.matchId;
  const lockSoon = new Date(m.lockAt).getTime() - Date.now() < 60 * 60 * 1000;

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      {/* meta 行（板塊名 → 賽事資訊連結：詳情頁優先，fallback 討論板） */}
      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <Link href={matchInfoUrl(m)} className="hover:text-[#2a8d92] hover:underline">
          {BOARD_LABEL[m.board] ?? m.board} · 賽事資訊 →
        </Link>
        {lockSoon ? (
          <span className="text-accent-600 font-medium">1 小時內封盤</span>
        ) : (
          <span className="font-mono-stadium tabular-nums">{twClock(m.startTime)}</span>
        )}
      </div>

      {/* 隊伍行 */}
      <div className="mt-1.5 flex items-center gap-1 text-[15px] font-bold text-gray-900">
        <TeamLabel nameEn={m.home} />
        <span className="text-xs text-gray-300 mx-1 shrink-0">vs</span>
        <TeamLabel nameEn={m.away} />
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

      {/* 選中提示：兩步制在盤口層可感知（P2-M） */}
      {selectedHere && slip && (
        <div className="mt-2 text-xs text-gray-400">
          投 100 P 命中拿回 <span className="font-mono-stadium tabular-nums text-gray-600">{Math.floor(100 * slip.quote.odds)}</span> P——金額在下方確認
        </div>
      )}
    </div>
  );
}

// ===== 我的競猜（進行中）：桌機右欄卡 / 手機頂部收合列（P1-B） =====

function PendingBets({ variant }: { variant: 'rail' | 'bar' }) {
  const { user } = useAuth();
  const { data } = useMyBets();
  const [open, setOpen] = useState(false);
  if (!user || !data?.data.enabled) return null;
  const pending = (data.data.bets ?? []).filter((b) => b.status === 'PENDING');
  if (pending.length === 0) return null;

  const list = (
    <div className="space-y-2">
      {pending.map((b) => (
        <div key={b.betId} className="flex items-center justify-between gap-2 text-xs">
          <div className="min-w-0">
            <Link href={matchInfoUrl(b)} className="block font-medium text-gray-900 truncate hover:text-[#2a8d92]"><TeamLabel nameEn={b.home} size="sm" /> <span className="text-gray-300">vs</span> <TeamLabel nameEn={b.away} size="sm" /></Link>
            <div className="text-gray-400">
              {selectionText(b)} <span className="font-mono-stadium tabular-nums">@{b.lockedOdds}</span> · 投入 <span className="font-mono-stadium tabular-nums">{b.stake}</span> P
            </div>
          </div>
          <div className="shrink-0 text-gray-400">
            命中 <span className="font-mono-stadium tabular-nums text-gray-600">{b.potentialPayout}</span> P
          </div>
        </div>
      ))}
    </div>
  );

  if (variant === 'rail') {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">進行中的競猜</h2>
          <span className="text-xs text-gray-400">{pending.length} 筆</span>
        </div>
        <div className="mt-3">{list}</div>
        {user && (
          <Link href={`/predictions/record/${encodeURIComponent(user.nickname)}`} className="mt-3 block text-xs text-[#2a8d92] hover:underline">
            看我的戰績 →
          </Link>
        )}
      </div>
    );
  }
  // mobile summary bar（左側青綠邊線；收合一行高）
  return (
    <div className="lg:hidden rounded-xl border border-gray-100 border-l-[3px] border-l-[#39B8BE] bg-white shadow-sm">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-2.5 text-sm">
        <span className="font-medium text-gray-900">進行中的競猜（{pending.length}）</span>
        <span className="text-gray-400 text-xs">{open ? '收合' : '展開'}</span>
      </button>
      {open && <div className="px-4 pb-3">{list}</div>}
    </div>
  );
}

// ===== 右欄：本週排行 Top 5（P1-J ②） =====

function TopFiveCard({ onViewFull }: { onViewFull: () => void }) {
  const { data } = usePredictionLeaderboard('week');
  const rows = (data?.data.rows ?? []).slice(0, 5);
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">本週排行</h2>
        <button onClick={onViewFull} className="text-xs text-[#2a8d92] hover:underline">看完整排行 →</button>
      </div>
      {rows.length === 0 ? (
        <div className="mt-3 text-xs text-gray-400">結算滿 1,000 P 即可入榜</div>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.nickname} className="flex items-center gap-2 text-xs">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                r.rank === 1 ? 'bg-accent-500 text-white' : r.rank <= 3 ? 'bg-accent-300/80 text-accent-900' : 'bg-gray-100 text-gray-500'
              }`}>{r.rank}</span>
              <Link href={`/predictions/record/${encodeURIComponent(r.nickname)}`} className="flex-1 truncate text-gray-900 hover:text-[#2a8d92]">
                {r.nickname}
              </Link>
              <span className="font-mono-stadium tabular-nums font-bold text-gray-900">{r.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== 右欄：玩法規則卡（P1-J ③，說明句降級到這） =====

function RulesCard() {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-gray-900">玩法</h2>
      <ul className="mt-2 space-y-1.5 text-xs text-gray-500">
        <li>賽前用 P 幣競猜，賠率在你確認當下鎖定</li>
        <li>開賽前 3 分鐘封盤，開賽後不再變動</li>
        <li>大小分遇整數總分剛好等於盤口線，退回本金</li>
        <li>賽事延期或取消，本金全額退回</li>
      </ul>
      <Link href="/member-center" className="mt-3 block text-xs text-[#2a8d92] hover:underline">
        G 幣兌換 P 幣 →
      </Link>
    </div>
  );
}

// ===== 頁面本體 =====

export default function PredictionsClient() {
  const router = useRouter();
  const { requireLogin, user } = useAuth();
  const { data: memberData } = useMemberSummary();
  const { data: boardsData, isLoading: boardsLoading } = usePredictionBoards();
  const boards = useMemo(() => boardsData?.data.boards ?? [], [boardsData]);
  const enabled = boardsData?.data.enabled;
  const [board, setBoard] = useState<string | null>(null);
  const [slip, setSlip] = useState<SlipSelection | null>(null);
  const [view, setView] = useState<'markets' | 'leaderboard'>('markets');

  useEffect(() => {
    if (!board && boards.length) setBoard(boards[0].board);
  }, [boards, board]);
  useEffect(() => {
    if (enabled === false) router.replace('/'); // fail-closed（比照 member-center）
  }, [enabled, router]);

  const { data: marketsData, isLoading } = usePredictionMarkets(board);
  const matches = marketsData?.data.matches ?? [];

  // 日期分組（P2-C）
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: MatchMarketsView[] }>();
    for (const m of matches) {
      const { key, label } = twDateGroup(m.startTime);
      if (!map.has(key)) map.set(key, { label, items: [] });
      map.get(key)!.items.push(m);
    }
    return [...map.values()];
  }, [matches]);

  if (enabled === false) return null;

  const member = memberData?.data;
  const pBalance = user && member?.enabled ? (member as { p?: number }).p : undefined;

  const pick = (s: SlipSelection) => {
    if (!requireLogin()) return;
    setSlip(s);
  };

  const marketsColumn = (
    <>
      {/* 板塊 pill */}
      <div className="flex gap-2">
        {boards.map((b) => (
          <button
            key={b.board}
            onClick={() => { setBoard(b.board); setView('markets'); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              board === b.board && view === 'markets'
                ? 'bg-[#39B8BE] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-[#39B8BE]/60'
            }`}
          >
            {BOARD_LABEL[b.board] ?? b.board}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-3 lg:mt-4">
        <PendingBets variant="bar" />
        {boardsLoading || isLoading ? (
          <div className="text-center text-sm text-gray-400 py-10">載入盤口中…</div>
        ) : matches.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
            目前沒有可競猜的賽事，開賽前會陸續開盤
          </div>
        ) : (
          grouped.map((g, gi) => (
            <div key={g.label}>
              <div className={`text-xs font-bold text-gray-400 mb-2 ${gi === 0 ? 'mt-1' : 'mt-6'}`}>
                <span className="font-mono-stadium tabular-nums">{g.label}</span>
              </div>
              <div className="space-y-3">
                {g.items.map((m) => <MatchCard key={m.matchId} m={m} slip={slip} onPick={pick} />)}
              </div>
            </div>
          ))
        )}
      </div>
      <p className="mt-6 text-xs text-gray-400 lg:hidden">賽前用 P 幣競猜，開賽即封盤，賠率在你確認當下鎖定。</p>
    </>
  );

  return (
    <div className="max-w-5xl mx-auto">
      {/* Row 1：標題 + 餘額 chip（P1-A；Antonio 標題 P2-L） */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl tracking-wide text-gray-900">賽事競猜</h1>
        {pBalance !== undefined && (
          <Link
            href="/member-center"
            className="rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-500 hover:border-[#39B8BE]/60"
          >
            餘額 <span className="font-mono-stadium tabular-nums font-bold text-gray-900">{pBalance}</span> P
          </Link>
        )}
      </div>

      {/* Row 2：手機版視圖切換（桌機盤口常駐主欄、排行榜常駐右欄，不需要 tab） */}
      <div className="mt-3 flex lg:hidden rounded-lg border border-gray-200 bg-white p-0.5 w-fit">
        {(['markets', 'leaderboard'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1 rounded-md text-sm font-medium transition-colors ${
              view === v ? 'bg-gray-900 text-white' : 'text-gray-600'
            }`}
          >
            {v === 'markets' ? '盤口' : '排行榜'}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* 主欄 */}
        <div className="lg:col-span-2">
          {view === 'leaderboard' ? (
            <div>
              <button onClick={() => setView('markets')} className="hidden lg:inline-block mb-3 text-xs text-[#2a8d92] hover:underline">
                ← 回盤口
              </button>
              <Leaderboard />
            </div>
          ) : (
            marketsColumn
          )}
        </div>

        {/* 右欄 rail（桌機；P1-J） */}
        <aside className="hidden lg:block lg:col-span-1">
          <div className="lg:sticky lg:top-24 space-y-4">
            <PendingBets variant="rail" />
            <TopFiveCard onViewFull={() => setView('leaderboard')} />
            <RulesCard />
          </div>
        </aside>
      </div>

      <BetSlip selection={slip} onClose={() => setSlip(null)} />
    </div>
  );
}
