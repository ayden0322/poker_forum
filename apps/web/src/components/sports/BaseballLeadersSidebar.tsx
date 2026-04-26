'use client';

import { useState } from 'react';

const LEAGUE_NAMES: Record<string, string> = {
  cpbl: '中華職棒',
  npb: '日本職棒',
  kbo: '韓國職棒',
};

const PREVIEW_CATEGORIES = [
  { key: 'homeRuns', shortLabel: '全壘打' },
  { key: 'battingAverage', shortLabel: '打擊率' },
  { key: 'runsBattedIn', shortLabel: '打點' },
  { key: 'stolenBases', shortLabel: '盜壘' },
  { key: 'earnedRunAverage', shortLabel: '防禦率' },
  { key: 'strikeouts', shortLabel: '三振' },
  { key: 'wins', shortLabel: '勝投' },
  { key: 'saves', shortLabel: '救援' },
];

/**
 * 棒球排行榜 sidebar（CPBL/NPB/KBO 共用）
 *
 * 目前 API-Sports 棒球無球員統計、CPBL 官方排行榜規劃中。
 * 此元件提供與 MLB LeadersSidebar 一致的視覺骨架。
 */
export function BaseballLeadersSidebar({ league }: { league: string }) {
  const [expanded, setExpanded] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('homeRuns');
  const leagueName = LEAGUE_NAMES[league] ?? league.toUpperCase();

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
          {/* 類別切換（視覺保留，目前無資料） */}
          <div className="flex flex-wrap gap-1 py-2">
            {PREVIEW_CATEGORIES.map((b) => (
              <button
                key={b.key}
                onClick={() => setActiveCategory(b.key)}
                className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                  activeCategory === b.key
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {b.shortLabel}
              </button>
            ))}
          </div>

          {/* 暫無資料 */}
          <div className="text-center py-6">
            <div className="text-3xl mb-2">📊</div>
            <div className="text-sm text-gray-500 font-medium">敬請期待</div>
            <div className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
              {league === 'cpbl'
                ? '即將整合 CPBL 官方數據排行榜'
                : '此聯盟數據統計規劃中'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
