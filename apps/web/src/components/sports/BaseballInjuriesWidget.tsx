'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

const LEAGUE_NAMES: Record<string, string> = {
  cpbl: '中華職棒',
  npb: '日本職棒',
  kbo: '韓國職棒',
};

interface NewsItem {
  date: string;
  title: string;
  url: string;
}

interface NewsResponse {
  success: boolean;
  data: NewsItem[];
}

const DEFAULT_VISIBLE = 5;

/**
 * 棒球公告動態 widget
 *
 * - CPBL：抓 cpbl.com.tw/news 列表（含合約讓渡、引退、延賽、人員異動等）
 * - NPB / KBO：暫無資料源，顯示「敬請期待」
 *
 * 視覺與 MLB InjuriesWidget 一致（折疊式）。
 */
export function BaseballInjuriesWidget({
  league,
  teamId: _teamId,
  days: _days = 14,
}: {
  league: string;
  teamId?: number;
  days?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const leagueName = LEAGUE_NAMES[league] ?? league.toUpperCase();
  const isCpbl = league === 'cpbl';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cpbl-news', league],
    queryFn: () => apiFetch<NewsResponse>(`/cpbl/news?limit=20`),
    staleTime: 10 * 60 * 1000,
    enabled: expanded && isCpbl,
    retry: 1,
  });

  const items = data?.data ?? [];
  const hasData = isCpbl && items.length > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* 標題列 */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <span>📢</span>
          <span>{leagueName}最新動態</span>
          {isCpbl && items.length > 0 && (
            <span className="text-[11px] font-normal text-gray-400">{items.length} 則</span>
          )}
        </span>
        <span className="text-xs text-gray-400">
          {expanded ? '▲ 收起' : '▼ 展開'}
        </span>
      </button>

      {/* 展開內容 */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          {!isCpbl ? (
            <PlaceholderContent leagueName={leagueName} />
          ) : isLoading ? (
            <div className="text-center py-4 text-gray-400 text-xs">載入中...</div>
          ) : isError || !hasData ? (
            <PlaceholderContent leagueName={leagueName} cpblFallback />
          ) : (
            <>
              <ul className="space-y-1.5 mt-2">
                {(showAll ? items : items.slice(0, DEFAULT_VISIBLE)).map((item, idx) => (
                  <li
                    key={`${item.date}-${idx}`}
                    className="border-b border-gray-50 pb-1.5 last:border-0 last:pb-0"
                  >
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 text-xs hover:text-blue-600 transition-colors"
                    >
                      <span className="text-[10px] text-gray-400 font-mono shrink-0 w-16 pt-0.5">
                        {item.date.replace(/^\d{4}\//, '')}
                      </span>
                      <span className="flex-1 min-w-0 text-gray-700 hover:text-blue-600">
                        {item.title}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
              {items.length > DEFAULT_VISIBLE && (
                <button
                  onClick={() => setShowAll((prev) => !prev)}
                  className="w-full text-center text-[11px] text-blue-500 hover:text-blue-700 transition-colors mt-1.5 py-1 rounded hover:bg-blue-50"
                >
                  {showAll ? '收起 ▲' : `查看更多（${items.length - DEFAULT_VISIBLE} 則）▼`}
                </button>
              )}
              <div className="text-[10px] text-gray-400 text-center mt-2 pt-2 border-t border-gray-100">
                資料來源：CPBL 官方新聞公告
              </div>
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
      <div className="text-3xl mb-2">📰</div>
      <div className="text-sm text-gray-500 font-medium">敬請期待</div>
      <div className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
        {cpblFallback
          ? '公告資料暫時無法取得，請稍後再試'
          : leagueName.includes('中華')
          ? '即將整合 CPBL 官方新聞公告'
          : `${leagueName}動態資料規劃中`}
      </div>
    </div>
  );
}
