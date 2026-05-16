'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

type InjuryType = 'injury' | 'activation' | 'transaction';

interface InjuryItem {
  type: InjuryType;
  date: string;
  team: string | null;
  player: string | null;
  category: string;
  title: string;
  url: string;
}

interface Response {
  success: boolean;
  data: InjuryItem[];
  summary: {
    total: number;
    injuries: number;
    activations: number;
    transactions: number;
  };
}

const DEFAULT_VISIBLE = 5;

function formatDate(dateStr: string): string {
  // CPBL date 格式：YYYY/MM/DD 或 MM/DD
  return dateStr.replace(/^\d{4}\//, '');
}

const TYPE_BADGE: Record<InjuryType, string> = {
  injury: 'bg-red-50 text-red-600',
  activation: 'bg-green-50 text-green-600',
  transaction: 'bg-blue-50 text-blue-600',
};

const TAB_ACTIVE: Record<InjuryType, string> = {
  injury: 'bg-red-500 text-white font-medium',
  activation: 'bg-green-500 text-white font-medium',
  transaction: 'bg-blue-500 text-white font-medium',
};

export function CpblInjuriesWidget({ defaultExpanded = false }: { defaultExpanded?: boolean }) {
  const [widgetExpanded, setWidgetExpanded] = useState(defaultExpanded);
  const [tab, setTab] = useState<InjuryType>('injury');
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cpbl-injuries'],
    queryFn: () => apiFetch<Response>('/cpbl/injuries?limit=40'),
    staleTime: 15 * 60 * 1000,
    enabled: widgetExpanded,
    retry: 1,
  });

  const allItems = data?.data ?? [];
  const filtered = allItems.filter((i) => i.type === tab);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setWidgetExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <span>🏥</span>
          <span>中華職棒傷兵動態</span>
          {data && (
            <span className="text-[11px] font-normal text-gray-400">
              {data.summary.injuries + data.summary.activations} 則
            </span>
          )}
        </span>
        <span className="text-xs text-gray-400">
          {widgetExpanded ? '▲ 收起' : '▼ 展開'}
        </span>
      </button>

      {widgetExpanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          <div className="flex gap-1 py-2 flex-wrap">
            {(['injury', 'activation', 'transaction'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setShowAll(false);
                }}
                className={`text-[11px] px-2.5 py-0.5 rounded-full transition-colors ${
                  tab === t
                    ? TAB_ACTIVE[t]
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t === 'injury' ? '新進傷兵' : t === 'activation' ? '球員回歸' : '異動公告'}
                {data && (
                  <span className="ml-1">
                    ({t === 'injury'
                      ? data.summary.injuries
                      : t === 'activation'
                      ? data.summary.activations
                      : data.summary.transactions})
                  </span>
                )}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="text-center py-4 text-gray-400 text-xs">載入中...</div>
          ) : isError ? (
            <div className="text-center py-4 text-gray-400 text-xs">資料暫時無法取得</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-4 text-gray-400 text-xs">
              {tab === 'injury'
                ? '近期官方公告無新傷兵訊息'
                : tab === 'activation'
                ? '近期無球員回歸公告'
                : '近期無異動公告'}
            </div>
          ) : (
            <>
              <ul className="space-y-1.5">
                {(showAll ? filtered : filtered.slice(0, DEFAULT_VISIBLE)).map((item, idx) => (
                  <li
                    key={`${item.date}-${idx}`}
                    className="border-b border-gray-50 pb-1.5 last:border-0 last:pb-0"
                  >
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 text-xs group"
                    >
                      <span className="text-[10px] text-gray-400 font-mono shrink-0 w-10 pt-0.5">
                        {formatDate(item.date)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          {item.team && (
                            <span className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                              {item.team}
                            </span>
                          )}
                          {item.player && (
                            <span className="font-medium text-gray-900">{item.player}</span>
                          )}
                          <span className={`text-[10px] font-bold px-1 py-0 rounded ${TYPE_BADGE[item.type]}`}>
                            {item.category}
                          </span>
                          <span className="text-gray-700 group-hover:text-blue-600 transition-colors truncate">
                            {item.title}
                          </span>
                        </div>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
              {filtered.length > DEFAULT_VISIBLE && (
                <button
                  onClick={() => setShowAll((prev) => !prev)}
                  className="w-full text-center text-[11px] text-blue-500 hover:text-blue-700 transition-colors mt-1.5 py-1 rounded hover:bg-blue-50"
                >
                  {showAll ? '收起 ▲' : `查看更多（${filtered.length - DEFAULT_VISIBLE} 則）▼`}
                </button>
              )}
              <div className="text-[10px] text-gray-400 text-center mt-2 pt-2 border-t border-gray-100">
                資料來源：CPBL 中華職棒大聯盟官方公告
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
