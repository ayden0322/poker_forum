'use client';

import { useState } from 'react';

const LEAGUE_NAMES: Record<string, string> = {
  cpbl: '中華職棒',
  npb: '日本職棒',
  kbo: '韓國職棒',
};

/**
 * 棒球傷兵動態 widget
 *
 * 目前 API-Sports 棒球無傷兵資料、CPBL 官方資料源規劃中。
 * 此元件提供與 MLB 傷兵 widget 一致的視覺骨架，內容暫顯「敬請期待」。
 *
 * 後續整合：
 *   - CPBL：爬 CPBL 官網新聞區
 *   - NPB / KBO：等待官方/二手資料源評估
 */
export function BaseballInjuriesWidget({
  league,
  teamId: _teamId,
  days = 14,
}: {
  league: string;
  teamId?: number;
  days?: number;
}) {
  const [expanded, setExpanded] = useState(false);
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
          <span>🏥</span>
          <span>{leagueName}傷兵動態</span>
          <span className="text-[11px] font-normal text-gray-400">近 {days} 天</span>
        </span>
        <span className="text-xs text-gray-400">
          {expanded ? '▲ 收起' : '▼ 展開'}
        </span>
      </button>

      {/* 展開內容 */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          <div className="text-center py-6">
            <div className="text-3xl mb-2">🚧</div>
            <div className="text-sm text-gray-500 font-medium">敬請期待</div>
            <div className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
              {league === 'cpbl'
                ? '即將整合 CPBL 官方傷兵公告'
                : '此聯盟傷兵資料源規劃中'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
