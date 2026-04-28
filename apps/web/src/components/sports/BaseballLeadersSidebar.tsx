'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';
import Link from 'next/link';

const LEAGUE_NAMES: Record<string, string> = {
  cpbl: '中華職棒',
  npb: '日本職棒',
  kbo: '韓國職棒',
};

/** CPBL 排行榜分類（與後端 CPBL_LEADER_CATEGORIES 對應） */
const CPBL_CATEGORIES = [
  { key: 'homeRuns', label: '全壘打', short: '全壘打' },
  { key: 'battingAverage', label: '打擊率', short: '打擊率' },
  { key: 'rbi', label: '打點', short: '打點' },
  { key: 'hits', label: '安打', short: '安打' },
  { key: 'stolenBases', label: '盜壘', short: '盜壘' },
  { key: 'era', label: '防禦率', short: '防禦率' },
  { key: 'wins', label: '勝投', short: '勝投' },
  { key: 'saves', label: '救援', short: '救援' },
  { key: 'holds', label: '中繼', short: '中繼' },
  { key: 'strikeouts', label: '三振', short: '三振' },
] as const;

/** NPB/KBO 暫無資料源，用同分類維持視覺一致 */
const PLACEHOLDER_CATEGORIES = CPBL_CATEGORIES;

interface CpblLeader {
  rank: number;
  playerAcnt: string;
  playerName: string;
  teamCode: string;
  teamName: string;
  value: string;
  category: string;
}

interface CpblLeadersResponse {
  success: boolean;
  data: CpblLeader[];
  meta: {
    category: string;
    year: number;
    label: string;
    unit: string;
  };
}

const DEFAULT_VISIBLE = 5;

/**
 * 棒球排行榜 sidebar
 *
 * - CPBL：對接 CPBL 官網 /stats/recordallaction（爬蟲），有資料顯示真實排行
 * - NPB/KBO：暫無資料源，維持「敬請期待」placeholder
 * - 視覺與 MLB LeadersSidebar 一致
 */
export function BaseballLeadersSidebar({ league }: { league: string }) {
  const [expanded, setExpanded] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('homeRuns');
  const [showAll, setShowAll] = useState(false);
  const leagueName = LEAGUE_NAMES[league] ?? league.toUpperCase();
  const isCpbl = league === 'cpbl';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cpbl-leaders', activeCategory],
    queryFn: () =>
      apiFetch<CpblLeadersResponse>(`/cpbl/leaders/${activeCategory}?limit=10`),
    staleTime: 10 * 60 * 1000,
    enabled: expanded && isCpbl,
    retry: 1,
  });

  const leaders = data?.data ?? [];
  const hasData = isCpbl && leaders.length > 0;
  const categories = isCpbl ? CPBL_CATEGORIES : PLACEHOLDER_CATEGORIES;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* 標題列 */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <span>🏆</span>
          <span>{leagueName}數據排行榜</span>
        </span>
        <span className="text-xs text-gray-400">
          {expanded ? '▲ 收起' : '▼ 展開'}
        </span>
      </button>

      {/* 展開內容 */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          {/* 類別切換 */}
          <div className="flex flex-wrap gap-1 py-2">
            {categories.map((b) => (
              <button
                key={b.key}
                onClick={() => {
                  setActiveCategory(b.key);
                  setShowAll(false);
                }}
                className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                  activeCategory === b.key
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {b.short}
              </button>
            ))}
          </div>

          {/* 內容區 */}
          {!isCpbl ? (
            // NPB/KBO：占位符
            <PlaceholderContent leagueName={leagueName} />
          ) : isLoading ? (
            <div className="text-center py-4 text-gray-400 text-xs">載入中...</div>
          ) : isError || !hasData ? (
            // CPBL 連不到時 fallback 顯示占位符
            <PlaceholderContent leagueName={leagueName} cpblFallback />
          ) : (
            <>
              <ol className="space-y-1">
                {(showAll ? leaders : leaders.slice(0, DEFAULT_VISIBLE)).map((leader) => (
                  <li
                    key={`${leader.rank}-${leader.playerAcnt}`}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span
                      className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        leader.rank <= 3
                          ? leader.rank === 1
                            ? 'bg-yellow-400 text-yellow-900'
                            : leader.rank === 2
                            ? 'bg-gray-300 text-gray-800'
                            : 'bg-orange-300 text-orange-900'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {leader.rank}
                    </span>
                    <Link
                      href={isCpbl ? `/player/baseball/cpbl/${leader.playerAcnt}` : '#'}
                      className="flex-1 min-w-0 flex items-center gap-1.5 hover:text-blue-600 transition-colors"
                    >
                      <span className="font-medium text-gray-800 truncate hover:text-blue-600">
                        {leader.playerName}
                      </span>
                      <span className="text-[10px] text-gray-400 truncate">
                        {leader.teamName}
                      </span>
                    </Link>
                    <span className="font-bold text-blue-600 tabular-nums shrink-0 text-xs">
                      {leader.value}
                      {data?.meta?.unit && (
                        <span className="text-[10px] text-gray-400 ml-0.5">
                          {data.meta.unit}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              {leaders.length > DEFAULT_VISIBLE && (
                <button
                  onClick={() => setShowAll((prev) => !prev)}
                  className="w-full text-center text-[11px] text-blue-500 hover:text-blue-700 transition-colors mt-1.5 py-1 rounded hover:bg-blue-50"
                >
                  {showAll ? '收起 ▲' : '查看更多 ▼'}
                </button>
              )}
              {data?.meta?.year && (
                <div className="text-[10px] text-gray-400 text-center mt-2">
                  {data.meta.year} 賽季 · 資料來源：CPBL 官方
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PlaceholderContent({
  leagueName,
  cpblFallback = false,
}: {
  leagueName: string;
  cpblFallback?: boolean;
}) {
  return (
    <div className="text-center py-6">
      <div className="text-3xl mb-2">📊</div>
      <div className="text-sm text-gray-500 font-medium">敬請期待</div>
      <div className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
        {cpblFallback
          ? '排行榜資料暫時無法取得，請稍後再試'
          : leagueName.includes('中華')
          ? '即將整合 CPBL 官方數據排行榜'
          : '此聯盟數據統計規劃中'}
      </div>
    </div>
  );
}
