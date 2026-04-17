'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useState } from 'react';

interface InjuryItem {
  type: 'injury' | 'activation';
  date: string;
  player: {
    id: number;
    nameEn: string;
    nameZhTw: string;
    shortName?: string;
  } | null;
  team: {
    id: number;
    nameEn: string;
    nameZhTw?: string;
    shortName?: string;
  } | null;
  ilType?: string;
  ilTypeZh?: string;
  injury?: string;
  injuryZh?: string;
  retroactive?: string;
  originalDescription: string;
}

interface Response {
  data: InjuryItem[];
  summary: {
    total: number;
    injuries: number;
    activations: number;
  };
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-');
  return `${m}/${d}`;
}

/** 預設顯示筆數 */
const DEFAULT_VISIBLE = 5;

export function InjuriesWidget({ teamId, days = 14 }: { teamId?: number; days?: number }) {
  const [widgetExpanded, setWidgetExpanded] = useState(false);
  const [tab, setTab] = useState<'injury' | 'activation'>('injury');
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['mlb-injuries', teamId ?? 'all', days],
    queryFn: () =>
      apiFetch<Response>(
        `/mlb/injuries?days=${days}${teamId ? `&teamId=${teamId}` : ''}`,
      ),
    staleTime: 15 * 60 * 1000, // 15 分鐘
    enabled: widgetExpanded, // 只有展開時才載入
  });

  const allItems = data?.data ?? [];
  const filtered = allItems.filter((i) => i.type === tab);

  const toggleOriginal = (key: string) => {
    const next = new Set(expandedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedSet(next);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* 標題列（可點擊展開/收起） */}
      <button
        type="button"
        onClick={() => setWidgetExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <span>🏥</span>
          <span>傷兵動態</span>
          <span className="text-[11px] font-normal text-gray-400">近 {days} 天</span>
        </span>
        <span className="text-xs text-gray-400">
          {widgetExpanded ? '▲ 收起' : '▼ 展開'}
        </span>
      </button>

      {/* 展開內容 */}
      {widgetExpanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          {/* Tabs */}
          <div className="flex gap-1 py-2">
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

          {/* 列表 */}
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
        </div>
      )}
    </div>
  );
}
