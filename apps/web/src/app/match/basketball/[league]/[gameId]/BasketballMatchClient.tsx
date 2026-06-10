'use client';

import Link from 'next/link';

export interface BBScore {
  quarter_1: number | null;
  quarter_2: number | null;
  quarter_3: number | null;
  quarter_4: number | null;
  over_time: number | null;
  total: number | null;
}
export interface BBTeam {
  id: number;
  name: string;
  nameZhTw?: string | null;
  shortName?: string | null;
  logo: string;
  score: number | null;
}
export interface BBGame {
  id: number;
  league: string;
  date: string;
  timestamp: number;
  status: string;
  statusShort: string;
  stage: string | null;
  venue: string | null;
  teams: { home: BBTeam; away: BBTeam };
  scores?: { home: BBScore; away: BBScore };
}

function label(t: BBTeam): string {
  return t.nameZhTw ?? t.name;
}

function twDateTime(ts: number): string {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function statusBadge(short: string) {
  if (short === 'LIVE') return { text: '● 進行中', cls: 'bg-red-500 text-white animate-pulse' };
  if (short === 'FT') return { text: '比賽結束', cls: 'bg-gray-200 text-gray-700' };
  return { text: '尚未開始', cls: 'bg-blue-50 text-blue-600' };
}

function TeamBlock({ league, t }: { league: string; t: BBTeam }) {
  return (
    <Link
      href={`/team/basketball/${league}/${t.id}`}
      className="flex flex-col items-center gap-2 flex-1 hover:opacity-80 transition-opacity"
    >
      {t.logo && (
        <img
          src={t.logo}
          alt={label(t)}
          className="w-16 h-16 md:w-20 md:h-20 object-contain"
          onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
        />
      )}
      <span className="font-bold text-gray-800 text-center text-sm md:text-base">{label(t)}</span>
    </Link>
  );
}

export default function BasketballMatchClient({
  league,
  leagueName,
  game,
  canOdds,
}: {
  league: string;
  leagueName: string;
  game: BBGame;
  canBoxScore: boolean;
  canOdds: boolean;
}) {
  const badge = statusBadge(game.statusShort);
  const home = game.teams.home;
  const away = game.teams.away;
  const sc = game.scores;
  const hasScore = home.score != null && away.score != null;
  const quarters: { key: keyof BBScore; label: string }[] = [
    { key: 'quarter_1', label: 'Q1' },
    { key: 'quarter_2', label: 'Q2' },
    { key: 'quarter_3', label: 'Q3' },
    { key: 'quarter_4', label: 'Q4' },
  ];
  const showOt = (sc?.home.over_time ?? null) != null || (sc?.away.over_time ?? null) != null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      {/* 麵包屑 */}
      <nav className="text-xs text-gray-400 mb-3 flex items-center gap-1">
        <Link href="/" className="hover:text-gray-600">首頁</Link>
        <span>›</span>
        <Link href={`/board/${league}`} className="hover:text-gray-600">{leagueName}</Link>
        <span>›</span>
        <span className="text-gray-500">比賽詳情</span>
      </nav>

      {/* 比分卡 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <div className="px-4 py-2 bg-gradient-to-r from-orange-50 to-white flex items-center gap-2 border-b border-gray-100">
          <span>🏀</span>
          <span className="text-sm font-bold text-gray-700">{leagueName}</span>
          {game.stage && <span className="text-xs text-gray-400">· {game.stage}</span>}
          <span className={`ml-auto text-[11px] px-2 py-0.5 rounded font-medium ${badge.cls}`}>{badge.text}</span>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <TeamBlock league={league} t={away} />
            <div className="flex flex-col items-center">
              {hasScore ? (
                <div className="text-3xl md:text-4xl font-extrabold tabular-nums text-gray-900">
                  {away.score} <span className="text-gray-300">:</span> {home.score}
                </div>
              ) : (
                <div className="text-lg font-bold text-gray-400">VS</div>
              )}
              <div className="text-[11px] text-gray-400 mt-1">{twDateTime(game.timestamp)}</div>
            </div>
            <TeamBlock league={league} t={home} />
          </div>

          {game.venue && (
            <div className="text-center text-xs text-gray-400 mt-3">📍 {game.venue}</div>
          )}
        </div>

        {/* 逐節比分 */}
        {sc && hasScore && (
          <div className="border-t border-gray-100 px-4 py-3 overflow-x-auto">
            <table className="w-full text-sm text-center">
              <thead>
                <tr className="text-gray-400 text-xs">
                  <th className="text-left font-medium py-1">球隊</th>
                  {quarters.map((q) => (
                    <th key={q.key} className="font-medium py-1 px-2">{q.label}</th>
                  ))}
                  {showOt && <th className="font-medium py-1 px-2">OT</th>}
                  <th className="font-bold py-1 px-2 text-gray-600">總分</th>
                </tr>
              </thead>
              <tbody>
                {([away, home] as BBTeam[]).map((t, idx) => {
                  const row = idx === 0 ? sc.away : sc.home;
                  return (
                    <tr key={t.id} className="border-t border-gray-50">
                      <td className="text-left py-1.5 font-medium text-gray-700">{t.shortName ?? label(t)}</td>
                      {quarters.map((q) => (
                        <td key={q.key} className="py-1.5 px-2 tabular-nums text-gray-600">{row[q.key] ?? '-'}</td>
                      ))}
                      {showOt && <td className="py-1.5 px-2 tabular-nums text-gray-600">{row.over_time ?? '-'}</td>}
                      <td className="py-1.5 px-2 tabular-nums font-bold text-gray-900">{row.total ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* inline CTA：接在「看完比分的動作」後 */}
      <div className="flex gap-3">
        <Link
          href={`/board/${league}`}
          className="flex-1 text-center py-2.5 rounded-lg bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 transition-colors"
        >
          💬 聊這場 · 進 {leagueName} 討論區
        </Link>
        {canOdds && (
          <Link
            href={`/board/${league}`}
            className="flex-1 text-center py-2.5 rounded-lg border border-orange-400 text-orange-600 font-medium text-sm hover:bg-orange-50 transition-colors"
          >
            🎯 競猜這場
          </Link>
        )}
      </div>

      <div className="mt-4 text-center">
        <Link href={`/board/${league}`} className="text-xs text-gray-400 hover:text-gray-600">← 返回 {leagueName}</Link>
      </div>
    </div>
  );
}
