'use client';

/**
 * FIFA 世界盃 2026 — 單場比賽詳情頁
 *
 * 因為目前資料源是 GitHub JSON（無球員陣容、無 play-by-play），
 * 這個頁只呈現基本資訊：
 *   - 對戰雙方（旗幟 + 中文隊名 + 比分 + 即時分鐘）
 *   - 階段、組別、場館、開賽時間
 *   - 同組其他比賽（小組賽才顯示）
 *
 * 升級 API-Sports 後可在此擴充：陣容、進球紀錄、賠率
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

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
  status: 'scheduled' | 'live' | 'finished';
  liveMinute: number | null;
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

function StatusBadge({ status, liveMinute }: { status: Match['status']; liveMinute: number | null }) {
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500 text-white rounded-full text-sm font-bold">
        <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
        LIVE {liveMinute != null && `· ${liveMinute}'`}
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

function TeamBlock({ team, score, isWinner, align }: { team: TeamView; score: number | null; isWinner: boolean; align: 'left' | 'right' }) {
  return (
    <div className={`flex flex-col items-center text-center min-w-0 ${align === 'left' ? 'md:items-end md:text-right' : 'md:items-start md:text-left'}`}>
      <div className="text-6xl mb-2 leading-none">{team.flag ?? '⚪'}</div>
      <div className={`text-lg md:text-xl font-bold mb-1 ${team.isPlaceholder ? 'text-gray-400 italic' : 'text-gray-900'}`}>
        {team.nameZh}
      </div>
      {team.fifaCode && <div className="text-xs text-gray-400 tracking-wider">{team.fifaCode}</div>}
      <div className={`text-5xl md:text-6xl font-bold mt-2 tabular-nums ${isWinner ? 'text-blue-600' : 'text-gray-700'}`}>
        {score ?? '-'}
      </div>
    </div>
  );
}

export default function WorldCupMatchPageClient({ matchNumber }: { matchNumber: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['world-cup-match', matchNumber],
    queryFn: () => apiFetch<{ data: Match }>(`/sports/world-cup/match/${matchNumber}`),
    refetchInterval: (q) => (q.state.data?.data.status === 'live' ? 30_000 : false),
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
  const isFinal = m.status === 'finished';
  const homeWins = isFinal && m.homeScore != null && m.awayScore != null && m.homeScore > m.awayScore;
  const awayWins = isFinal && m.homeScore != null && m.awayScore != null && m.awayScore > m.homeScore;

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
      <div className="bg-gradient-to-br from-blue-50 via-white to-blue-50 border border-gray-200 rounded-xl p-6 md:p-8 mb-4 shadow-sm">
        <div className="flex flex-col items-center mb-6 gap-2">
          <div className="text-xs text-gray-500 tracking-wider">
            {m.group ? `${m.group} · ` : ''}{m.round}
          </div>
          <StatusBadge status={m.status} liveMinute={m.liveMinute} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-6 md:gap-8 items-center">
          <TeamBlock team={m.home} score={m.homeScore} isWinner={homeWins} align="left" />

          <div className="flex flex-col items-center text-gray-300 font-light">
            <div className="text-3xl">VS</div>
          </div>

          <TeamBlock team={m.away} score={m.awayScore} isWinner={awayWins} align="right" />
        </div>
      </div>

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

      {/* 同組其他比賽 */}
      {m.stage === 'group' && groupData?.data && groupData.data.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">📋 {m.group} 其他比賽</div>
          <div className="space-y-2">
            {groupData.data
              .filter((g) => g.matchNumber !== m.matchNumber)
              .map((g) => {
                const fin = g.status === 'finished';
                const hWin = fin && g.homeScore != null && g.awayScore != null && g.homeScore > g.awayScore;
                const aWin = fin && g.homeScore != null && g.awayScore != null && g.awayScore > g.homeScore;
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
                      {g.status === 'scheduled' ? 'vs' : `${g.homeScore ?? '-'} - ${g.awayScore ?? '-'}`}
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

      {/* 提示卡片 — 標示功能限制 */}
      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
        💡 目前資料源為 GitHub 公開賽程，僅含基本資訊。升級 API-Sports 後將提供：球員陣容、進球紀錄、即時統計、賠率等完整資料。
      </div>
    </div>
  );
}
