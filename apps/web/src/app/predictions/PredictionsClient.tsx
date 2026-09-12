'use client';

// P幣競猜中心（設計規格 §7；2026-09-13 依 Codex UI 審查改版）
// - 預設「全部聯盟、依台灣時間排」：不用逐一點分頁才知道有哪些比賽；日期與聯盟只是篩選
// - 賽事是主角：隊徽 + 隊名 16px 為視覺重心；賠率壓成 44px 高的橫排小按鈕，未選中中性色、只有選中才青綠
// - 桌機雙欄（主欄盤口、右欄 sticky rail：我的競猜/週榜Top5/規則）
// - 未登入看得到盤（點競猜才撞登入牆）；fail-closed：enabled=false 導回首頁

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth';
import { useMemberSummary } from '@/lib/member';
import {
  MatchMarketsView,
  SELECTION_LABEL,
  selectionText,
  twClock,
  twDateGroup,
  useMyBets,
  usePredictionBoards,
  usePredictionLeaderboard,
  usePredictionMarketsAll,
  matchInfoUrl,
} from '@/lib/predictions';
import BetSlip, { SlipSelection } from '@/components/predictions/BetSlip';
import TeamLabel from '@/components/predictions/TeamLabel';
import Leaderboard from '@/components/predictions/Leaderboard';

// 板塊中文名一律吃後端的 boardLabel / displayName（來源 sports_configs.display_name），前端不建對照表。

// ===== 賠率按鈕：標籤 + 賠率橫排、44px 高；青綠只給選中態 =====

function OddsButton({
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
    return (
      <div className="inline-flex h-11 items-center justify-center rounded-md border border-dashed border-gray-200 text-xs text-gray-400">
        暫無
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-800 focus-visible:ring-offset-2 ${
        selected
          ? 'border-primary-500 bg-primary-500 text-white'
          : 'border-gray-200 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50'
      }`}
    >
      <span className={`text-xs ${selected ? 'text-white/85' : 'text-gray-500'}`}>{label}</span>
      <span className="font-mono-stadium tabular-nums font-semibold">{odds}</span>
    </button>
  );
}

function MarketGroup({ legend, cols, children }: { legend: string; cols: 2 | 3; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-medium text-gray-500">{legend}</legend>
      <div className={`grid gap-1.5 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>{children}</div>
    </fieldset>
  );
}

// ===== 賽事卡：聯盟/時間 → 隊伍（主角）→ 盤口 → 連結 =====

function MatchCard({ m, slip, onPick }: { m: MatchMarketsView; slip: SlipSelection | null; onPick: (s: SlipSelection) => void }) {
  // 大小分只給一條主線：取中間那條（線已在後端過濾成整數與 .5）
  const mainOu = m.overUnder.length ? m.overUnder[Math.floor(m.overUnder.length / 2)] : null;
  const isSel = (market: string, selection: string, line: number | null) =>
    !!slip && slip.match.matchId === m.matchId && slip.market === market && slip.selection === selection && slip.line === line;
  const selectedHere = !!slip && slip.match.matchId === m.matchId;
  const lockSoon = new Date(m.lockAt).getTime() - Date.now() < 60 * 60 * 1000;
  const hasDraw = !!m.winlose.DRAW;
  const winloseSels = (hasDraw ? ['HOME', 'DRAW', 'AWAY'] : ['HOME', 'AWAY']) as Array<'HOME' | 'DRAW' | 'AWAY'>;
  const ouLegend = `${m.sportType === 'football' ? '總進球' : '總得分'} ${mainOu?.line ?? ''}`;

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-gray-500">{m.boardLabel}</span>
        <span className="text-sm font-medium text-gray-700 font-mono-stadium tabular-nums">
          {twClock(m.startTime)}
          {lockSoon && <span className="ml-2 font-sans text-xs font-normal text-gray-500">1 小時內封盤</span>}
        </span>
      </div>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <TeamLabel nameEn={m.home} logoUrl={m.homeLogoUrl} size="lg" className="sm:flex-1" />
        <span aria-hidden="true" className="hidden shrink-0 text-xs text-gray-400 sm:block">vs</span>
        <TeamLabel nameEn={m.away} logoUrl={m.awayLogoUrl} size="lg" className="sm:flex-1" />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[3fr_2fr]">
        {Object.keys(m.winlose).length > 0 && (
          <MarketGroup legend="勝負" cols={hasDraw ? 3 : 2}>
            {winloseSels.map((sel) => (
              <OddsButton
                key={sel}
                label={SELECTION_LABEL[sel]}
                odds={m.winlose[sel]?.odds}
                selected={isSel('WINLOSE', sel, null)}
                onClick={() =>
                  m.winlose[sel] && onPick({ match: m, market: 'WINLOSE', selection: sel, line: null, quote: m.winlose[sel]! })
                }
              />
            ))}
          </MarketGroup>
        )}
        {mainOu && (
          <MarketGroup legend={ouLegend} cols={2}>
            <OddsButton
              label="大"
              odds={mainOu.over?.odds}
              selected={isSel('OVER_UNDER', 'OVER', mainOu.line)}
              onClick={() =>
                mainOu.over && onPick({ match: m, market: 'OVER_UNDER', selection: 'OVER', line: mainOu.line, quote: mainOu.over })
              }
            />
            <OddsButton
              label="小"
              odds={mainOu.under?.odds}
              selected={isSel('OVER_UNDER', 'UNDER', mainOu.line)}
              onClick={() =>
                mainOu.under && onPick({ match: m, market: 'OVER_UNDER', selection: 'UNDER', line: mainOu.line, quote: mainOu.under })
              }
            />
          </MarketGroup>
        )}
      </div>

      {selectedHere && slip && (
        <p className="mt-2 text-xs text-gray-500">
          以 100 P 競猜，命中拿回 <span className="font-mono-stadium tabular-nums text-gray-700">{Math.floor(100 * slip.quote.odds)}</span> P，點數在下方確認
        </p>
      )}

      <div className="mt-2 flex gap-4 border-t border-gray-100">
        <Link
          href={matchInfoUrl(m)}
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary-700 underline-offset-4 hover:underline"
        >
          {m.detailUrl ? '賽事資訊' : `前往${m.boardLabel}板`}
        </Link>
      </div>
    </article>
  );
}

// ===== 我的競猜（進行中）：桌機右欄卡 / 手機頂部收合列 =====

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
            <Link href={matchInfoUrl(b)} className="block font-medium text-gray-900 truncate hover:text-primary-700">
              <TeamLabel nameEn={b.home} size="sm" /> <span className="text-gray-300">vs</span> <TeamLabel nameEn={b.away} size="sm" />
            </Link>
            <div className="text-gray-500">
              {selectionText(b)} <span className="font-mono-stadium tabular-nums">@{b.lockedOdds}</span> · 競猜 <span className="font-mono-stadium tabular-nums">{b.stake}</span> P
            </div>
          </div>
          <div className="shrink-0 text-gray-500">
            命中 <span className="font-mono-stadium tabular-nums text-gray-700">{b.potentialPayout}</span> P
          </div>
        </div>
      ))}
    </div>
  );

  if (variant === 'rail') {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">進行中的競猜</h2>
          <span className="text-xs text-gray-500">{pending.length} 筆</span>
        </div>
        <div className="mt-3">{list}</div>
        {user && (
          <Link href={`/predictions/record/${encodeURIComponent(user.nickname)}`} className="mt-3 inline-flex min-h-11 items-center text-sm text-primary-700 hover:underline underline-offset-4">
            看我的戰績
          </Link>
        )}
      </div>
    );
  }
  return (
    <div className="lg:hidden rounded-lg border border-gray-200 border-l-[3px] border-l-primary-500 bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex min-h-11 items-center justify-between px-4 text-sm"
      >
        <span className="font-medium text-gray-900">進行中的競猜（{pending.length}）</span>
        <span className="text-gray-500 text-xs">{open ? '收合' : '展開'}</span>
      </button>
      {open && <div className="px-4 pb-3">{list}</div>}
    </div>
  );
}

// ===== 右欄：本週獲利榜 Top 5 =====

function TopFiveCard({ onViewFull }: { onViewFull: () => void }) {
  const { data } = usePredictionLeaderboard('week', 'profit');
  const rows = (data?.data.rows ?? []).slice(0, 5);
  const minSettled = data?.data.minSettled ?? 30;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">本週獲利榜</h2>
        <button type="button" onClick={onViewFull} className="text-sm text-primary-700 hover:underline underline-offset-4">
          看完整排行
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">滿 {minSettled} 場已結算競猜即可入榜</p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.nickname} className="flex items-center gap-2 text-xs">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  r.rank === 1 ? 'bg-accent-500 text-white' : r.rank <= 3 ? 'bg-accent-100 text-gray-800' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {r.rank}
              </span>
              <Link href={`/predictions/record/${encodeURIComponent(r.nickname)}`} className="flex-1 truncate text-gray-900 hover:text-primary-700">
                {r.nickname}
              </Link>
              <span className={`font-mono-stadium tabular-nums font-bold ${r.profit >= 0 ? 'text-primary-700' : 'text-gray-500'}`}>
                {r.profit >= 0 ? '+' : ''}
                {r.profit} P
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== 規則卡（桌機右欄 / 手機頁尾共用） =====

function RulesCard() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-bold text-gray-900">玩法</h2>
      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-gray-600">
        <li>賽前用 P 幣競猜，賠率在你確認當下鎖定</li>
        <li>開賽前 3 分鐘封盤，開賽後不再變動</li>
        <li>大小分遇整數總分剛好等於盤口線，退回本金</li>
        <li>賽事延期或取消，本金全額退回</li>
      </ul>
      <Link href="/member-center" className="mt-2 inline-flex min-h-11 items-center text-sm text-primary-700 hover:underline underline-offset-4">
        G 幣兌換 P 幣
      </Link>
    </div>
  );
}

// ===== 篩選 chip =====

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors ${
        active
          ? 'border-primary-500 bg-primary-500 text-white'
          : disabled
            ? 'border-gray-100 bg-white text-gray-300'
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
      }`}
    >
      {children}
    </button>
  );
}

// ===== 頁面本體 =====

export default function PredictionsClient() {
  const router = useRouter();
  const { requireLogin, user } = useAuth();
  const { data: memberData } = useMemberSummary();
  const { data: boardsData } = usePredictionBoards();
  const enabled = boardsData?.data.enabled;
  const { data: allData, isLoading } = usePredictionMarketsAll();
  const matches = useMemo(() => allData?.data.matches ?? [], [allData]);
  const boards = useMemo(() => allData?.data.boards ?? [], [allData]);
  const unavailable = allData?.data.unavailableBoards ?? [];

  const [dateKey, setDateKey] = useState<string | null>(null);
  const [league, setLeague] = useState<string | null>(null); // null = 全部聯盟
  const [slip, setSlip] = useState<SlipSelection | null>(null);
  const [view, setView] = useState<'markets' | 'leaderboard'>('markets');

  useEffect(() => {
    if (enabled === false) router.replace('/'); // fail-closed（比照 member-center）
  }, [enabled, router]);

  // 有賽事的台灣日期（依時間序）；標籤「今天 / 明天」看台灣日曆日
  const dates = useMemo(() => {
    const todayKey = twDateGroup(new Date().toISOString()).key;
    const tomorrowKey = twDateGroup(new Date(Date.now() + 86_400_000).toISOString()).key;
    const seen = new Map<string, string>();
    for (const m of matches) {
      const { key, label } = twDateGroup(m.startTime);
      if (!seen.has(key)) {
        seen.set(key, key === todayKey ? `今天 ${key}` : key === tomorrowKey ? `明天 ${key}` : label);
      }
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label }));
  }, [matches]);

  useEffect(() => {
    if (dates.length && (!dateKey || !dates.some((d) => d.key === dateKey))) setDateKey(dates[0].key);
  }, [dates, dateKey]);

  const onDate = useMemo(() => matches.filter((m) => twDateGroup(m.startTime).key === dateKey), [matches, dateKey]);
  const countByBoard = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of onDate) c.set(m.board, (c.get(m.board) ?? 0) + 1);
    return c;
  }, [onDate]);
  const visible = useMemo(() => (league ? onDate.filter((m) => m.board === league) : onDate), [onDate, league]);
  const dateLabel = dates.find((d) => d.key === dateKey)?.label ?? '';
  const leagueLabel = boards.find((b) => b.board === league)?.displayName ?? '';

  if (enabled === false) return null;

  const member = memberData?.data;
  const pBalance = user && member?.enabled ? (member as { p?: number }).p : undefined;

  const pick = (s: SlipSelection) => {
    if (!requireLogin()) return;
    setSlip(s);
  };

  const marketsColumn = (
    <>
      {/* 日期列 */}
      {dates.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {dates.map((d) => (
            <Chip key={d.key} active={d.key === dateKey} onClick={() => { setDateKey(d.key); setView('markets'); }}>
              {d.label}
            </Chip>
          ))}
        </div>
      )}

      {/* 聯盟列：全部 + 各聯盟（當日場次數） */}
      {boards.length > 0 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          <Chip active={league === null} onClick={() => setLeague(null)}>
            全部聯盟 <span className="font-mono-stadium tabular-nums text-xs opacity-80">{onDate.length}</span>
          </Chip>
          {boards.map((b) => {
            const n = countByBoard.get(b.board) ?? 0;
            return (
              <Chip key={b.board} active={league === b.board} disabled={n === 0 && league !== b.board} onClick={() => setLeague(league === b.board ? null : b.board)}>
                {b.displayName}
                <span className="font-mono-stadium tabular-nums text-xs opacity-80">{n}</span>
              </Chip>
            );
          })}
        </div>
      )}

      {unavailable.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          {unavailable.map((slug) => boards.find((b) => b.board === slug)?.displayName ?? slug).join('、')} 暫時無法取得盤口
        </p>
      )}

      <div className="mt-3 space-y-3">
        <PendingBets variant="bar" />
        {isLoading ? (
          <div className="py-10 text-center text-sm text-gray-500">載入盤口中</div>
        ) : matches.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            目前沒有可競猜的賽事，開賽前會陸續開盤
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            {leagueLabel} 在 {dateLabel} 沒有可競猜賽事
            <button type="button" onClick={() => setLeague(null)} className="ml-2 text-primary-700 hover:underline underline-offset-4">
              看全部聯盟
            </button>
          </div>
        ) : (
          <section>
            <h2 className="flex items-center gap-3 text-sm font-semibold text-gray-700">
              <span className="font-mono-stadium tabular-nums">{dateLabel}</span>
              <span className="text-xs font-normal text-gray-500">台灣時間</span>
              <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
            </h2>
            <div className="mt-2 space-y-3">
              {visible.map((m) => (
                <MatchCard key={m.matchId} m={m} slip={slip} onPick={pick} />
              ))}
            </div>
          </section>
        )}
      </div>
      <div className="mt-6 lg:hidden">
        <RulesCard />
      </div>
    </>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-wide text-gray-900">賽事競猜</h1>
          <p className="mt-1 text-sm text-gray-600">選擇賽事，留下你的預測。</p>
        </div>
        {pBalance !== undefined && (
          <Link
            href="/member-center"
            className="shrink-0 whitespace-nowrap rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:border-gray-400"
          >
            可用 P 幣 <span className="font-mono-stadium tabular-nums font-bold text-gray-900">{pBalance.toLocaleString('zh-TW')}</span>
          </Link>
        )}
      </div>

      {/* 手機版視圖切換（桌機盤口常駐主欄、排行榜常駐右欄） */}
      <div className="mt-3 flex lg:hidden rounded-md border border-gray-200 bg-white p-0.5 w-fit">
        {(['markets', 'leaderboard'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`min-h-10 px-4 rounded text-sm font-medium transition-colors ${view === v ? 'bg-gray-900 text-white' : 'text-gray-600'}`}
          >
            {v === 'markets' ? '盤口' : '排行榜'}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 items-start lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0">
          {view === 'leaderboard' ? (
            <div>
              <button type="button" onClick={() => setView('markets')} className="hidden lg:inline-flex min-h-11 items-center mb-2 text-sm text-primary-700 hover:underline underline-offset-4">
                回盤口
              </button>
              <Leaderboard />
            </div>
          ) : (
            marketsColumn
          )}
        </div>

        <aside className="hidden lg:block">
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
