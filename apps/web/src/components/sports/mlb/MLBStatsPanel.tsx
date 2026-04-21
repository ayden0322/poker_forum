'use client';

/**
 * MLB 數據面板（排行榜 + 傷兵動態合併）
 *
 * 使用 Tab 切換兩種資訊，整體可展開/收起。
 * 解決原本兩個 widget 並排時高度不對稱造成的視覺落差問題。
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useState } from 'react';

/* ─── 型別 ─── */
interface Leader {
  rank: number;
  value: string;
  player: { id: number; nameEn: string; nameZhTw: string; shortName?: string };
  team: { id: number; nameEn: string };
}

interface InjuryItem {
  type: 'injury' | 'activation';
  date: string;
  player: { id: number; nameEn: string; nameZhTw: string; shortName?: string } | null;
  team: { id: number; nameEn: string; nameZhTw?: string; shortName?: string } | null;
  ilType?: string;
  ilTypeZh?: string;
  injury?: string;
  injuryZh?: string;
  originalDescription: string;
}

interface InjurySummary {
  total: number;
  injuries: number;
  activations: number;
}

/* ─── 常數 ─── */
const LEADERBOARDS = [
  { key: 'homeRuns',         shortLabel: '全壘打', unit: '轟' },
  { key: 'battingAverage',   shortLabel: '打擊率', unit: '' },
  { key: 'runsBattedIn',     shortLabel: '打點',   unit: '分' },
  { key: 'stolenBases',      shortLabel: '盜壘',   unit: '盜' },
  { key: 'earnedRunAverage', shortLabel: '防禦率', unit: '' },
  { key: 'strikeouts',       shortLabel: '三振',   unit: 'K' },
  { key: 'wins',             shortLabel: '勝投',   unit: '勝' },
  { key: 'saves',            shortLabel: '救援',   unit: '救援' },
];

const DEFAULT_VISIBLE = 5;
const INJURY_DAYS = 14;

/* ─── 子元件：排行榜內容 ─── */
function LeadersContent() {
  const [activeCategory, setActiveCategory] = useState<string>('homeRuns');
  const [showAll, setShowAll] = useState(false);
  const currentConfig = LEADERBOARDS.find((b) => b.key === activeCategory)!;

  const { data, isLoading } = useQuery({
    queryKey: ['mlb-leaders', activeCategory],
    queryFn: () => apiFetch<{ data: Leader[] }>(`/mlb/leaders/${activeCategory}?limit=10`),
    staleTime: 60 * 60 * 1000,
  });

  const leaders = data?.data ?? [];

  return (
    <>
      {/* 類別切換 */}
      <div className="flex flex-wrap gap-1 pb-2">
        {LEADERBOARDS.map((b) => (
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
            {b.shortLabel}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-4 text-gray-400 text-xs">載入中...</div>
      ) : leaders.length === 0 ? (
        <div className="text-center py-4 text-gray-400 text-xs">暫無資料</div>
      ) : (
        <>
          <ol className="space-y-1">
            {(showAll ? leaders : leaders.slice(0, DEFAULT_VISIBLE)).map((leader) => (
              <li key={`${leader.rank}-${leader.player.id}`} className="flex items-center gap-2 text-xs">
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
                  href={`/player/mlb/${leader.player.id}`}
                  className="flex-1 min-w-0 hover:text-blue-600 transition-colors flex items-center gap-1.5"
                >
                  <span className="font-medium text-gray-800 truncate">
                    {leader.player.shortName ?? leader.player.nameZhTw}
                  </span>
                  <span className="text-[10px] text-gray-400 truncate">
                    {leader.team.nameEn}
                  </span>
                </Link>
                <span className="font-bold text-blue-600 tabular-nums shrink-0 text-xs">
                  {leader.value}
                  {currentConfig.unit && <span className="text-[10px] text-gray-400 ml-0.5">{currentConfig.unit}</span>}
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
        </>
      )}
    </>
  );
}

/* ─── 子元件：傷兵動態內容 ─── */
function InjuriesContent() {
  const [tab, setTab] = useState<'injury' | 'activation'>('injury');
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['mlb-injuries', 'all', INJURY_DAYS],
    queryFn: () =>
      apiFetch<{ data: InjuryItem[]; summary: InjurySummary }>(
        `/mlb/injuries?days=${INJURY_DAYS}`,
      ),
    staleTime: 15 * 60 * 1000,
  });

  const allItems = data?.data ?? [];
  const filtered = allItems.filter((i) => i.type === tab);

  const toggleOriginal = (key: string) => {
    const next = new Set(expandedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedSet(next);
  };

  function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const [, m, d] = dateStr.split('-');
    return `${m}/${d}`;
  }

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-1 pb-2">
        <button
          onClick={() => {
            setTab('injury');
            setShowAll(false);
          }}
          className={`text-[11px] px-2.5 py-0.5 rounded-full transition-colors ${
            tab === 'injury'
              ? 'bg-red-500 text-white font-medium'
              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
          }`}
        >
          新進傷兵
          {data?.summary.injuries ? ` (${data.summary.injuries})` : ''}
        </button>
        <button
          onClick={() => {
            setTab('activation');
            setShowAll(false);
          }}
          className={`text-[11px] px-2.5 py-0.5 rounded-full transition-colors ${
            tab === 'activation'
              ? 'bg-green-500 text-white font-medium'
              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
          }`}
        >
          球員回歸
          {data?.summary.activations ? ` (${data.summary.activations})` : ''}
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-4 text-gray-400 text-xs">載入中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-4 text-gray-400 text-xs">
          {tab === 'injury' ? '近期無新傷兵' : '近期無球員回歸'}
        </div>
      ) : (
        <>
          <ul className="space-y-1.5">
            {(showAll ? filtered : filtered.slice(0, DEFAULT_VISIBLE)).map((item, idx) => {
              const key = `${item.date}-${item.player?.id}-${idx}`;
              const isExpanded = expandedSet.has(key);

              return (
                <li
                  key={key}
                  className="border-b border-gray-50 pb-1.5 last:border-0 last:pb-0"
                >
                  <div className="flex items-start gap-2 text-xs">
                    <span className="text-[10px] text-gray-400 font-mono shrink-0 w-8 pt-0.5">
                      {formatDate(item.date)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        {item.team && (
                          <Link
                            href={`/team/mlb/${item.team.id}`}
                            className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded hover:bg-blue-50 hover:text-blue-600"
                          >
                            {item.team.shortName ?? item.team.nameZhTw ?? item.team.nameEn}
                          </Link>
                        )}
                        {item.player && (
                          <Link
                            href={`/player/mlb/${item.player.id}`}
                            className="font-medium text-gray-900 hover:text-blue-600"
                          >
                            {item.player.shortName ?? item.player.nameZhTw}
                          </Link>
                        )}
                        {item.ilTypeZh && (
                          <span
                            className={`text-[10px] font-bold px-1 py-0 rounded ${
                              item.type === 'injury'
                                ? 'bg-red-50 text-red-600'
                                : 'bg-green-50 text-green-600'
                            }`}
                          >
                            {item.type === 'activation' ? '回歸' : item.ilTypeZh}
                          </span>
                        )}
                      </div>
                      {item.injuryZh && (
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {item.injuryZh}
                        </div>
                      )}
                      {isExpanded && (
                        <div className="text-[10px] text-gray-400 mt-1 p-1.5 bg-gray-50 rounded">
                          {item.originalDescription}
                        </div>
                      )}
                      <button
                        onClick={() => toggleOriginal(key)}
                        className="text-[10px] text-blue-400 hover:text-blue-600 mt-0.5"
                      >
                        {isExpanded ? '▲ 收起' : '▼ 原文'}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {filtered.length > DEFAULT_VISIBLE && (
            <button
              onClick={() => setShowAll((prev) => !prev)}
              className="w-full text-center text-[11px] text-blue-500 hover:text-blue-700 transition-colors mt-1.5 py-1 rounded hover:bg-blue-50"
            >
              {showAll ? '收起 ▲' : '查看更多 ▼'}
            </button>
          )}
        </>
      )}
    </>
  );
}

/* ─── 主元件 ─── */
export function MLBStatsPanel() {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'leaders' | 'injuries'>('leaders');

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
      {/* 標題列：Tab 切換 + 展開/收起 */}
      <div className="flex items-center border-b border-transparent">
        {/* Tab 區 */}
        <div className="flex flex-1">
          <button
            type="button"
            onClick={() => {
              if (!expanded) setExpanded(true);
              setActiveTab('leaders');
            }}
            className={`px-3 py-2 text-sm font-semibold transition-colors flex items-center gap-2 ${
              expanded && activeTab === 'leaders'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-gray-600 hover:bg-gray-50 border-b-2 border-transparent'
            }`}
          >
            <span>🏆</span>
            <span>數據排行榜</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!expanded) setExpanded(true);
              setActiveTab('injuries');
            }}
            className={`px-3 py-2 text-sm font-semibold transition-colors flex items-center gap-2 ${
              expanded && activeTab === 'injuries'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-gray-600 hover:bg-gray-50 border-b-2 border-transparent'
            }`}
          >
            <span>🏥</span>
            <span>傷兵動態</span>
            <span className="text-[11px] font-normal text-gray-400">近 {INJURY_DAYS} 天</span>
          </button>
        </div>

        {/* 展開/收起按鈕 */}
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {expanded ? '▲ 收起' : '▼ 展開'}
        </button>
      </div>

      {/* 內容區 */}
      {expanded && (
        <div className="px-3 pt-2 pb-3">
          {activeTab === 'leaders' ? <LeadersContent /> : <InjuriesContent />}
        </div>
      )}
    </div>
  );
}
