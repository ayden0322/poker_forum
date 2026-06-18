'use client';

/**
 * FIFA 世界盃 2026 — 單場比賽詳情頁
 *
 * 資料源為 GitHub 賽程（無球員陣容、無即時比分），狀態一律由開賽時間推算
 * （見 lib/world-cup-status.ts）。主卡片依狀態條件式呈現：
 *   - 尚未開賽：開賽倒數
 *   - 比賽中：進行中提示（無資料源時不顯示假比分）
 *   - 已結束：完場 / 若 admin 有輸入比分則顯示比分與勝方
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { deriveWcStatus, wcHasScore, type WcStatus } from '@/lib/world-cup-status';
import { WorldCupLiveBoard } from '@/components/sports/world-cup/live/WorldCupLiveBoard';

interface TeamView {
  id: number | null;
  fifaCode: string | null;
  nameEn: string;
  nameZh: string;
  flag: string | null;
  isPlaceholder: boolean;
}

interface Match {
  id: number;
  matchNumber: number;
  round: string;
  stage: 'group' | 'knockout';
  group: string | null;
  kickoffAt: string;
  venue: string;
  home: TeamView;
  away: TeamView;
  homeScore: number | null;
  awayScore: number | null;
  status: WcStatus;
  liveMinute: number | null;
}

interface LineupPlayer {
  name: string;
  number: number | null;
  pos: string | null;
}
interface LineupSide {
  formation: string | null;
  coach: string | null;
  startXI: LineupPlayer[];
  substitutes: LineupPlayer[];
}
interface MatchDetails {
  available: boolean;
  events: {
    minute: number;
    extra: number | null;
    side: 'home' | 'away' | null;
    type: string;
    detail: string;
    player: string | null;
    assist: string | null;
  }[];
  statistics: { type: string; home: string | number | null; away: string | number | null }[];
  lineups: { home: LineupSide | null; away: LineupSide | null };
}

function fmtTw(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 掛載後每秒更新；SSR/首幀回傳 null 以避免 hydration 不一致 */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '即將開球';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} 天 ${String(h).padStart(2, '0')} 小時`;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function StatusBadge({ status }: { status: WcStatus }) {
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500 text-white rounded-full text-sm font-bold">
        <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
        比賽中
      </span>
    );
  }
  if (status === 'finished') {
    return (
      <span className="inline-flex items-center px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-sm font-medium">
        已結束
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
      尚未開賽
    </span>
  );
}

function TeamBlock({
  team,
  score,
  showScore,
  isWinner,
  align,
}: {
  team: TeamView;
  score: number | null;
  showScore: boolean;
  isWinner: boolean;
  align: 'left' | 'right';
}) {
  return (
    <div
      className={`flex flex-col items-center text-center min-w-0 ${
        align === 'left' ? 'md:items-end md:text-right' : 'md:items-start md:text-left'
      }`}
    >
      <div className="text-6xl mb-2 leading-none">{team.flag ?? '⚪'}</div>
      <div
        className={`text-lg md:text-xl font-bold mb-1 ${
          team.isPlaceholder ? 'text-gray-400 italic' : 'text-gray-900'
        }`}
      >
        {team.nameZh}
      </div>
      {team.fifaCode && <div className="text-xs text-gray-400 tracking-wider">{team.fifaCode}</div>}
      {showScore && (
        <div
          className={`text-5xl md:text-6xl font-bold mt-2 tabular-nums ${
            isWinner ? 'text-blue-600' : 'text-gray-700'
          }`}
        >
          {score ?? '-'}
        </div>
      )}
    </div>
  );
}

/** 主卡片中央：依狀態切換倒數 / 進行中 / 完場 */
function CenterZone({ status, kickoffAt, now }: { status: WcStatus; kickoffAt: string; now: number | null }) {
  if (status === 'scheduled') {
    const remaining = now == null ? null : new Date(kickoffAt).getTime() - now;
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="text-3xl text-gray-300 font-light">VS</div>
        <div className="text-[11px] text-gray-400 tracking-wider">距開賽</div>
        <div className="text-xl font-bold tabular-nums text-blue-600">
          {remaining == null ? '--:--:--' : fmtCountdown(remaining)}
        </div>
      </div>
    );
  }
  if (status === 'live') {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="text-3xl text-gray-300 font-light">VS</div>
        <span className="inline-flex items-center gap-1.5 text-red-500 font-bold text-sm">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          進行中
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-3xl text-gray-300 font-light">VS</div>
      <div className="text-sm font-medium text-gray-500">完場</div>
    </div>
  );
}

function eventLabel(type: string, detail: string): { text: string; cls: string } {
  if (type === 'Goal') return { text: '進球', cls: 'text-teal-700 bg-teal-50 border-teal-200' };
  if (type === 'Card')
    return detail.includes('Red')
      ? { text: '紅牌', cls: 'text-red-600 bg-red-50 border-red-200' }
      : { text: '黃牌', cls: 'text-amber-600 bg-amber-50 border-amber-200' };
  if (type === 'subst') return { text: '換人', cls: 'text-gray-500 bg-gray-50 border-gray-200' };
  if (type === 'Var') return { text: 'VAR', cls: 'text-purple-600 bg-purple-50 border-purple-200' };
  return { text: type, cls: 'text-gray-500 bg-gray-50 border-gray-200' };
}

/** API-Sports 數據項目英文 → 中文 */
const STAT_ZH: Record<string, string> = {
  'Shots on Goal': '射正',
  'Shots off Goal': '射偏',
  'Total Shots': '總射門',
  'Blocked Shots': '被擋射門',
  'Shots insidebox': '禁區內射門',
  'Shots outsidebox': '禁區外射門',
  Fouls: '犯規',
  'Corner Kicks': '角球',
  Offsides: '越位',
  'Ball Possession': '控球率',
  'Yellow Cards': '黃牌',
  'Red Cards': '紅牌',
  'Goalkeeper Saves': '撲救',
  'Total passes': '總傳球',
  'Passes accurate': '成功傳球',
  'Passes %': '傳球成功率',
  expected_goals: '預期進球 (xG)',
  goals_prevented: '防止失球',
};

function statNum(v: string | number | null): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace('%', '')) || 0;
}

/** 賽事細節：進球時間軸 + 數據對比 + 先發陣容 */
function MatchDetailsSections({ m, details }: { m: Match; details: MatchDetails }) {
  const keyEvents = details.events.filter((e) => ['Goal', 'Card', 'subst', 'Var'].includes(e.type));

  return (
    <>
      {/* 進球與事件 */}
      {keyEvents.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-3">
          <div className="text-sm font-bold text-gray-800 mb-3">⚽ 進球與事件</div>
          <div className="space-y-2">
            {keyEvents.map((e, i) => {
              const lbl = eventLabel(e.type, e.detail);
              const isHome = e.side === 'home';
              return (
                <div
                  key={i}
                  className={`flex items-center gap-2 text-sm ${isHome ? '' : 'flex-row-reverse text-right'}`}
                >
                  <span className="text-xs tabular-nums text-gray-400 w-9 flex-shrink-0">
                    {e.minute}&apos;{e.extra ? `+${e.extra}` : ''}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${lbl.cls}`}>
                    {lbl.text}
                  </span>
                  <span className="min-w-0">
                    <span className={`${e.type === 'Goal' ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                      {e.player ?? '—'}
                    </span>
                    {e.type === 'Goal' && e.assist && (
                      <span className="text-xs text-gray-400"> （助攻 {e.assist}）</span>
                    )}
                    {e.type === 'subst' && e.assist && (
                      <span className="text-xs text-gray-400"> ↔ {e.assist}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 比賽數據 */}
      {details.statistics.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-3">
          <div className="flex items-center justify-between text-sm font-bold text-gray-800 mb-3">
            <span className="flex items-center gap-1.5">
              <span>{m.home.flag}</span>
              {m.home.nameZh}
            </span>
            <span className="text-xs text-gray-400">比賽數據</span>
            <span className="flex items-center gap-1.5">
              {m.away.nameZh}
              <span>{m.away.flag}</span>
            </span>
          </div>
          <div className="space-y-2.5">
            {details.statistics.map((s) => {
              const h = statNum(s.home);
              const a = statNum(s.away);
              const total = h + a || 1;
              const hPct = (h / total) * 100;
              return (
                <div key={s.type}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="font-medium tabular-nums text-gray-800 w-10">{s.home ?? '-'}</span>
                    <span className="text-gray-400">{STAT_ZH[s.type] ?? s.type}</span>
                    <span className="font-medium tabular-nums text-gray-800 w-10 text-right">{s.away ?? '-'}</span>
                  </div>
                  <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100">
                    <div className="bg-teal-500" style={{ width: `${hPct}%` }} />
                    <div className="bg-gray-300" style={{ width: `${100 - hPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 先發陣容 */}
      {(details.lineups.home || details.lineups.away) && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-3">
          <div className="text-sm font-bold text-gray-800 mb-3">📋 先發陣容</div>
          <div className="grid grid-cols-2 gap-4">
            {([['home', m.home], ['away', m.away]] as const).map(([side, team]) => {
              const lu = details.lineups[side];
              return (
                <div key={side}>
                  <div className="flex items-center gap-1.5 mb-2 text-sm font-medium">
                    <span>{team.flag}</span>
                    <span className="truncate">{team.nameZh}</span>
                    {lu?.formation && (
                      <span className="text-[10px] text-gray-400 tabular-nums">{lu.formation}</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {(lu?.startXI ?? []).map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-gray-700">
                        <span className="w-5 text-gray-400 tabular-nums text-right">{p.number ?? ''}</span>
                        <span className="truncate">{p.name}</span>
                        {p.pos && <span className="text-[10px] text-gray-300 ml-auto">{p.pos}</span>}
                      </div>
                    ))}
                    {!lu && <div className="text-xs text-gray-400">陣容未公布</div>}
                  </div>
                  {lu?.coach && (
                    <div className="mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-400">
                      教練 {lu.coach}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

export default function WorldCupMatchPageClient({ matchNumber }: { matchNumber: number }) {
  const now = useNow();

  const { data, isLoading, error } = useQuery({
    queryKey: ['world-cup-match', matchNumber],
    queryFn: () => apiFetch<{ data: Match }>(`/sports/world-cup/match/${matchNumber}`),
    refetchInterval: (q) => (q.state.data?.data.status === 'live' ? 30_000 : false),
  });

  // 賽事細節（進球/數據/陣容，整合自 API-Sports）
  const { data: detailsData } = useQuery({
    queryKey: ['world-cup-match-details', matchNumber],
    enabled: !!data && data.data.status !== 'scheduled',
    queryFn: () => apiFetch<{ data: MatchDetails }>(`/sports/world-cup/match/${matchNumber}/details`),
    // 細節由後端 cron 約每 1 分鐘刷新進 Redis，此處只讀我們的快取，30 秒輪詢即可貼近更新
    refetchInterval: (q) =>
      data?.data.status === 'live' && q.state.data?.data.available ? 30_000 : false,
  });

  // 同組其他比賽
  const { data: groupData } = useQuery({
    queryKey: ['world-cup-group-matches', data?.data.group],
    enabled: !!data?.data.group,
    queryFn: () => {
      const grp = data!.data.group!.replace('Group ', '');
      return apiFetch<{ data: Match[] }>(`/sports/world-cup/matches?group=${grp}`);
    },
  });

  if (isLoading) return <div className="max-w-4xl mx-auto p-8 text-center text-gray-400">載入中...</div>;
  if (error || !data) return <div className="max-w-4xl mx-auto p-8 text-center text-red-400">找不到比賽</div>;

  const m = data.data;
  // 顯示狀態以「掛載後的即時時間」推算，跨開賽/完場邊界時 UI 會自動翻轉；
  // 首幀 fallback 用伺服器已推算好的 m.status，避免 hydration 不一致
  const displayStatus: WcStatus = now == null ? m.status : deriveWcStatus(m.kickoffAt, now);
  const scored = wcHasScore(m.homeScore, m.awayScore);
  const showScore = scored && displayStatus !== 'scheduled';
  const isFinal = displayStatus === 'finished';
  const homeWins = showScore && isFinal && m.homeScore! > m.awayScore!;
  const awayWins = showScore && isFinal && m.awayScore! > m.homeScore!;
  const details = detailsData?.data;
  const hasDetails = !!details?.available;

  return (
    <div className="max-w-4xl mx-auto pb-8">
      {/* 麵包屑 */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        <Link href="/" className="hover:text-blue-600">首頁</Link>
        <span>/</span>
        <Link href="/board/world-cup" className="hover:text-blue-600">世界盃</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">第 {m.matchNumber} 場</span>
      </nav>

      {/* 主卡片 */}
      <div className="bg-gradient-to-br from-blue-50 via-white to-blue-50 border border-gray-200 rounded-xl p-6 md:p-8 mb-3 shadow-sm">
        <div className="flex flex-col items-center mb-6 gap-2">
          <div className="text-xs text-gray-500 tracking-wider">
            {m.group ? `${m.group} · ` : ''}{m.round}
          </div>
          <StatusBadge status={displayStatus} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-6 md:gap-8 items-center">
          <TeamBlock team={m.home} score={m.homeScore} showScore={showScore} isWinner={homeWins} align="left" />
          <CenterZone status={displayStatus} kickoffAt={m.kickoffAt} now={now} />
          <TeamBlock team={m.away} score={m.awayScore} showScore={showScore} isWinner={awayWins} align="right" />
        </div>

        {/* 無比分資料源時的誠實提示 */}
        {!scored && displayStatus !== 'scheduled' && (
          <div className="mt-6 text-center text-sm text-gray-500">
            {displayStatus === 'live'
              ? '即時比分請鎖定電視轉播，戰況討論移步看板'
              : '賽事已結束 · 比分整理中'}
          </div>
        )}
      </div>

      {/* 即時賽事動畫板（進行中 / 已結束有細節時） */}
      {hasDetails && (
        <WorldCupLiveBoard
          home={m.home}
          away={m.away}
          homeScore={m.homeScore}
          awayScore={m.awayScore}
          status={displayStatus}
          liveMinute={m.liveMinute}
          events={details!.events}
          statistics={details!.statistics}
        />
      )}

      {/* 戰報 CTA */}
      <Link
        href="/board/world-cup"
        className="flex items-center justify-center gap-2 mb-4 px-4 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors shadow-sm"
      >
        💬 看本場戰報與鄉民討論
        <span aria-hidden>→</span>
      </Link>

      {/* 賽事資訊 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">🕐 開賽時間（台灣時區）</div>
          <div className="text-base font-medium text-gray-900">{fmtTw(m.kickoffAt)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">📍 場館</div>
          <div className="text-base font-medium text-gray-900">{m.venue}</div>
        </div>
      </div>

      {/* 賽事細節（進球/數據/陣容，整合自 API-Sports） */}
      {hasDetails && <MatchDetailsSections m={m} details={details!} />}

      {/* 同組其他比賽 */}
      {m.stage === 'group' && groupData?.data && groupData.data.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">📋 {m.group} 其他比賽</div>
          <div className="space-y-2">
            {groupData.data
              .filter((g) => g.matchNumber !== m.matchNumber)
              .map((g) => {
                // 未開賽不顯示比分（即使 seed 預填了分數）
                const gShowScore = wcHasScore(g.homeScore, g.awayScore) && g.status !== 'scheduled';
                const gFin = g.status === 'finished';
                const hWin = gShowScore && gFin && g.homeScore! > g.awayScore!;
                const aWin = gShowScore && gFin && g.awayScore! > g.homeScore!;
                return (
                  <Link
                    key={g.id}
                    href={`/match/world-cup/${g.matchNumber}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm"
                  >
                    <span className="text-[10px] text-gray-400 w-16 truncate">{g.round}</span>
                    <span className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                      <span className={`truncate ${hWin ? 'font-bold' : 'text-gray-600'}`}>{g.home.nameZh}</span>
                      <span className="text-base">{g.home.flag ?? '⚪'}</span>
                    </span>
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-xs tabular-nums font-medium min-w-[44px] text-center">
                      {gShowScore ? `${g.homeScore} - ${g.awayScore}` : 'vs'}
                    </span>
                    <span className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-base">{g.away.flag ?? '⚪'}</span>
                      <span className={`truncate ${aWin ? 'font-bold' : 'text-gray-600'}`}>{g.away.nameZh}</span>
                    </span>
                    {g.status === 'live' && (
                      <span className="text-[10px] text-red-500 font-bold flex items-center gap-0.5">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                        LIVE
                      </span>
                    )}
                  </Link>
                );
              })}
          </div>
        </div>
      )}

      {/* 提示卡片 — 僅在尚無細節時顯示（開賽前 / 細節整理中） */}
      {!hasDetails && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          💡 進球紀錄、比賽數據與先發陣容將於開賽後整合自 API-Sports 即時呈現。
        </div>
      )}
    </div>
  );
}
