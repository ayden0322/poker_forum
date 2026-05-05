'use client';

/**
 * NBA 側邊面板：Tab 切換「數據王」 / 「傷兵動態」
 * 取代原本獨立的 NBALeadersSidebar，與 NBAStandingsWidget 並排佔右側欄
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useState } from 'react';

/* ────── Leaders ────── */
interface Leader {
  rank: number;
  playerId: number;
  playerName: string;
  team: string;
  value: number;
  gp: number;
  nameZhTw?: string;
  espnPlayerId?: number;
}

const LEADER_CATS = [
  { key: 'PTS', label: '得分', suffix: '' },
  { key: 'REB', label: '籃板', suffix: '' },
  { key: 'AST', label: '助攻', suffix: '' },
  { key: 'STL', label: '抄截', suffix: '' },
  { key: 'BLK', label: '阻攻', suffix: '' },
  { key: 'FG3M', label: '三分', suffix: '' },
  { key: 'FG_PCT', label: '命中率', suffix: '%' },
  { key: 'FT_PCT', label: '罰球%', suffix: '%' },
];

/* ────── Injuries ────── */
interface Injury {
  id: string;
  status: string;
  date?: string;
  shortComment?: string;
  details?: { detail?: string; type?: string; returnDate?: string; fantasyStatus?: { abbreviation?: string } };
  athlete: { espnId?: number | null; displayName?: string; nameZhTw?: string; position?: string; headshot?: string };
  team: { espnId?: number | null; abbreviation?: string; nameZhTw?: string; shortName?: string; logo?: string };
}

export function NBASidePanel() {
  const [tab, setTab] = useState<'leaders' | 'injuries'>('leaders');
  return (
    <div className="rounded-xl bg-white border border-orange-100 overflow-hidden">
      <div className="flex border-b border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50">
        <button
          onClick={() => setTab('leaders')}
          className={`flex-1 px-3 py-2.5 text-sm font-semibold transition ${
            tab === 'leaders'
              ? 'bg-white text-orange-600 border-b-2 border-orange-500'
              : 'text-gray-600 hover:bg-orange-100/60'
          }`}
        >
          🏆 數據王
        </button>
        <button
          onClick={() => setTab('injuries')}
          className={`flex-1 px-3 py-2.5 text-sm font-semibold transition ${
            tab === 'injuries'
              ? 'bg-white text-orange-600 border-b-2 border-orange-500'
              : 'text-gray-600 hover:bg-orange-100/60'
          }`}
        >
          🏥 傷兵動態
        </button>
      </div>
      {tab === 'leaders' ? <LeadersContent /> : <InjuriesContent />}
    </div>
  );
}

function LeadersContent() {
  const [activeCategory, setActiveCategory] = useState<string>('PTS');
  const [showAll, setShowAll] = useState(false);
  const cat = LEADER_CATS.find((c) => c.key === activeCategory)!;

  const { data, isLoading } = useQuery({
    queryKey: ['nba-leaders', activeCategory],
    queryFn: () => apiFetch<{ data: Leader[] }>(`/nba/leaders/${activeCategory}?limit=10`),
    staleTime: 6 * 60 * 60 * 1000,
  });
  const leaders = data?.data ?? [];
  const visible = showAll ? leaders : leaders.slice(0, 5);
  const fmt = (v: number, s: string) => (v == null ? '—' : s === '%' ? (v * 100).toFixed(1) + '%' : Number(v).toFixed(1));

  return (
    <>
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-gray-100">
        {LEADER_CATS.map((c) => (
          <button
            key={c.key}
            onClick={() => {
              setActiveCategory(c.key);
              setShowAll(false);
            }}
            className={`px-2 py-1 rounded text-[11px] font-medium transition ${
              activeCategory === c.key
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-orange-100'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="p-4 text-center text-xs text-gray-400 animate-pulse">載入中...</div>
      ) : leaders.length === 0 ? (
        <div className="p-4 text-center text-xs text-gray-400">尚無資料</div>
      ) : (
        <>
          <div className="divide-y divide-gray-50">
            {visible.map((p) => {
              const inner = (
                <>
                  <div className="col-span-1 text-center font-bold text-gray-400">{p.rank}</div>
                  <div className="col-span-7 truncate">
                    <div className="truncate font-medium text-gray-800">{p.nameZhTw ?? p.playerName}</div>
                    <div className="text-[10px] text-gray-400 truncate">{p.team} · {p.gp} 場</div>
                  </div>
                  <div className="col-span-4 text-right font-mono font-bold text-orange-600">
                    {fmt(p.value, cat.suffix)}
                  </div>
                </>
              );
              const cls = 'grid grid-cols-12 gap-1 px-3 py-2 text-xs items-center hover:bg-orange-50 transition';
              return p.espnPlayerId ? (
                <Link key={p.playerId} href={`/player/nba/${p.espnPlayerId}`} className={cls}>
                  {inner}
                </Link>
              ) : (
                <div key={p.playerId} className={cls}>{inner}</div>
              );
            })}
          </div>
          {leaders.length > 5 && (
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-right">
              <button onClick={() => setShowAll(!showAll)} className="text-[11px] text-orange-600 hover:text-orange-700 font-medium">
                {showAll ? '收起' : `展開全部 (${leaders.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function InjuriesContent() {
  const [showAll, setShowAll] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['nba-injuries'],
    queryFn: () => apiFetch<{ data: Injury[] }>(`/nba/injuries`),
    staleTime: 30 * 60 * 1000,
  });
  const list = data?.data ?? [];
  // 排序：最近日期在前
  const sorted = [...list].sort((a, b) => (a.date && b.date ? (a.date > b.date ? -1 : 1) : 0));
  const visible = showAll ? sorted : sorted.slice(0, 8);

  const statusColor = (s: string) => {
    if (s === 'Out') return 'bg-red-100 text-red-700';
    if (s === 'Doubtful') return 'bg-orange-100 text-orange-700';
    if (s === 'Questionable') return 'bg-yellow-100 text-yellow-700';
    if (s === 'Day-To-Day') return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-600';
  };
  const statusZh: Record<string, string> = {
    'Out': '出戰存疑',
    'Doubtful': '極可能不出戰',
    'Questionable': '出戰存疑',
    'Day-To-Day': '逐日觀察',
  };

  return (
    <>
      {isLoading ? (
        <div className="p-4 text-center text-xs text-gray-400 animate-pulse">載入中...</div>
      ) : list.length === 0 ? (
        <div className="p-4 text-center text-xs text-gray-400">目前無傷兵動態</div>
      ) : (
        <>
          <div className="divide-y divide-gray-100">
            {visible.map((inj) => (
              <div key={inj.id} className="px-3 py-2.5 text-xs hover:bg-orange-50/40 transition">
                <div className="flex items-start gap-2">
                  {inj.athlete.headshot ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={inj.athlete.headshot} alt="" className="w-8 h-8 rounded-full object-cover bg-gray-100 flex-shrink-0" />
                  ) : inj.team.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={inj.team.logo} alt="" className="w-8 h-8 flex-shrink-0" />
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      {inj.athlete.espnId ? (
                        <Link
                          href={`/player/nba/${inj.athlete.espnId}`}
                          className="font-medium text-gray-800 hover:text-orange-600 truncate"
                        >
                          {inj.athlete.nameZhTw ?? inj.athlete.displayName}
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-800 truncate">
                          {inj.athlete.nameZhTw ?? inj.athlete.displayName}
                        </span>
                      )}
                      <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${statusColor(inj.status)}`}>
                        {statusZh[inj.status] ?? inj.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {inj.team.shortName ?? inj.team.nameZhTw ?? inj.team.abbreviation}
                      {inj.details?.detail && ` · ${inj.details.detail}`}
                      {inj.details?.type && !inj.details.detail && ` · ${inj.details.type}`}
                    </div>
                    {inj.details?.returnDate && (
                      <div className="text-[10px] text-orange-600 mt-0.5">
                        預計回歸：{inj.details.returnDate}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {sorted.length > 8 && (
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-right">
              <button onClick={() => setShowAll(!showAll)} className="text-[11px] text-orange-600 hover:text-orange-700 font-medium">
                {showAll ? '收起' : `展開全部 (${sorted.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
