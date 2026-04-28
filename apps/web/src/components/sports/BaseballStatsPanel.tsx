'use client';

/**
 * 職棒數據面板 — 視覺與 MLBStatsPanel 同步
 *
 * 使用 Tab 切換「數據排行榜」與「最新動態」，整體可展開/收起。
 * 適用：CPBL（中華職棒）/ NPB（日本職棒）/ KBO（韓國職棒）。
 *
 * - CPBL：排行榜抓 cpbl 官方爬蟲、動態抓 cpbl 官方新聞
 * - NPB / KBO：暫無資料源，顯示「敬請期待」placeholder
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useState } from 'react';

const LEAGUE_NAMES: Record<string, string> = {
  cpbl: '中華職棒',
  npb: '日本職棒',
  kbo: '韓國職棒',
};

const CPBL_CATEGORIES = [
  { key: 'homeRuns', short: '全壘打' },
  { key: 'battingAverage', short: '打擊率' },
  { key: 'rbi', short: '打點' },
  { key: 'hits', short: '安打' },
  { key: 'stolenBases', short: '盜壘' },
  { key: 'era', short: '防禦率' },
  { key: 'wins', short: '勝投' },
  { key: 'saves', short: '救援' },
  { key: 'holds', short: '中繼' },
  { key: 'strikeouts', short: '三振' },
] as const;

const DEFAULT_VISIBLE = 5;

interface CpblLeader {
  rank: number;
  playerAcnt: string;
  playerName: string;
  teamCode: string;
  teamName: string;
  value: string;
}

interface CpblLeadersResponse {
  success: boolean;
  data: CpblLeader[];
  meta: { category: string; year: number; label: string; unit: string };
}

interface NewsItem {
  date: string;
  title: string;
  url: string;
}

interface NewsResponse {
  success: boolean;
  data: NewsItem[];
}

/* ─── 子元件：排行榜 ─── */
function LeadersContent({ league }: { league: string }) {
  const isCpbl = league === 'cpbl';
  const [activeCategory, setActiveCategory] = useState<string>('homeRuns');
  const [showAll, setShowAll] = useState(false);
  const leagueName = LEAGUE_NAMES[league] ?? league.toUpperCase();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cpbl-leaders', activeCategory],
    queryFn: () =>
      apiFetch<CpblLeadersResponse>(`/cpbl/leaders/${activeCategory}?limit=10`),
    staleTime: 10 * 60 * 1000,
    enabled: isCpbl,
    retry: 1,
  });

  const leaders = data?.data ?? [];
  const hasData = isCpbl && leaders.length > 0;

  return (
    <>
      {/* 類別切換 */}
      <div className="flex flex-wrap gap-1 pb-2">
        {CPBL_CATEGORIES.map((b) => (
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

      {!isCpbl ? (
        <PlaceholderContent leagueName={leagueName} kind="leaders" />
      ) : isLoading ? (
        <div className="text-center py-4 text-gray-400 text-xs">載入中...</div>
      ) : isError || !hasData ? (
        <PlaceholderContent leagueName={leagueName} kind="leaders" cpblFallback />
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
                  href={`/player/baseball/cpbl/${leader.playerAcnt}`}
                  className="flex-1 min-w-0 hover:text-blue-600 transition-colors flex items-center gap-1.5"
                >
                  <span className="font-medium text-gray-800 truncate">{leader.playerName}</span>
                  <span className="text-[10px] text-gray-400 truncate">{leader.teamName}</span>
                </Link>
                <span className="font-bold text-blue-600 tabular-nums shrink-0 text-xs">
                  {leader.value}
                  {data?.meta?.unit && (
                    <span className="text-[10px] text-gray-400 ml-0.5">{data.meta.unit}</span>
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
    </>
  );
}

/* ─── 子元件：最新動態（公告/新聞）─── */
/**
 * CPBL 新聞標題常見格式：「【中信兄弟】｜ ... 」或「中華職棒大聯盟 ...」
 * 嘗試從標題抓出隊伍名稱當 tag，視覺對齊 MLB 的 [date][team-tag][title][type-tag]。
 */
const TEAM_KEYWORDS = [
  '中信兄弟',
  '富邦悍將',
  '味全龍',
  '樂天桃猿',
  '統一獅',
  '台鋼雄鷹',
] as const;

function extractTeamTag(title: string): string | null {
  for (const t of TEAM_KEYWORDS) {
    if (title.includes(t)) return t;
  }
  return null;
}

/** 動態類型分類（依關鍵字推斷） */
function classifyNews(title: string): { label: string; tone: 'red' | 'green' | 'gray' | 'blue' } {
  if (/(傷|不適|手術|休養|休賽|缺陣|登錄傷兵|轉入)/.test(title)) {
    return { label: '傷兵', tone: 'red' };
  }
  if (/(回歸|歸隊|復出|登錄一軍|回到一軍|啟用)/.test(title)) {
    return { label: '回歸', tone: 'green' };
  }
  if (/(簽約|續約|讓渡|交易|釋出|加盟|引退|退休)/.test(title)) {
    return { label: '異動', tone: 'blue' };
  }
  return { label: '公告', tone: 'gray' };
}

const TONE_CLS: Record<string, string> = {
  red: 'bg-red-50 text-red-600',
  green: 'bg-green-50 text-green-600',
  blue: 'bg-blue-50 text-blue-600',
  gray: 'bg-gray-100 text-gray-600',
};

function NewsContent({ league }: { league: string }) {
  const isCpbl = league === 'cpbl';
  const [showAll, setShowAll] = useState(false);
  const leagueName = LEAGUE_NAMES[league] ?? league.toUpperCase();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cpbl-news', league],
    queryFn: () => apiFetch<NewsResponse>(`/cpbl/news?limit=20`),
    staleTime: 10 * 60 * 1000,
    enabled: isCpbl,
    retry: 1,
  });

  const items = data?.data ?? [];
  const hasData = isCpbl && items.length > 0;

  if (!isCpbl) {
    return <PlaceholderContent leagueName={leagueName} kind="news" />;
  }
  if (isLoading) {
    return <div className="text-center py-4 text-gray-400 text-xs">載入中...</div>;
  }
  if (isError || !hasData) {
    return <PlaceholderContent leagueName={leagueName} kind="news" cpblFallback />;
  }

  const visible = showAll ? items : items.slice(0, DEFAULT_VISIBLE);

  return (
    <>
      <ul className="space-y-1.5">
        {visible.map((item, idx) => {
          const teamTag = extractTeamTag(item.title);
          const cls = classifyNews(item.title);
          // 把標題中重複的隊伍前綴去掉，避免 tag 跟標題重複
          const cleanTitle = teamTag
            ? item.title.replace(new RegExp(`^[\\s\\[【]?${teamTag}[\\s\\]】｜｜:：]?`), '').trim() ||
              item.title
            : item.title;
          const dateShort = item.date.replace(/^\d{4}\//, '');
          return (
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
                <span className="text-[10px] text-gray-400 font-mono shrink-0 w-10 pt-0.5 leading-tight">
                  {dateShort}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 flex-wrap">
                    {teamTag && (
                      <span className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                        {teamTag}
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-bold px-1 py-0 rounded ${TONE_CLS[cls.tone]}`}
                    >
                      {cls.label}
                    </span>
                    <span className="font-medium text-gray-800 group-hover:text-blue-600 transition-colors truncate">
                      {cleanTitle}
                    </span>
                  </div>
                </div>
              </a>
            </li>
          );
        })}
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
  );
}

/* ─── Placeholder ─── */
function PlaceholderContent({
  leagueName,
  kind,
  cpblFallback = false,
}: {
  leagueName: string;
  kind: 'leaders' | 'news';
  cpblFallback?: boolean;
}) {
  const isLeaders = kind === 'leaders';
  return (
    <div className="text-center py-6">
      <div className="text-3xl mb-2">{isLeaders ? '📊' : '📰'}</div>
      <div className="text-sm text-gray-500 font-medium">敬請期待</div>
      <div className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
        {cpblFallback
          ? `${isLeaders ? '排行榜' : '公告'}資料暫時無法取得，請稍後再試`
          : leagueName.includes('中華')
          ? `即將整合 CPBL 官方${isLeaders ? '數據排行榜' : '新聞公告'}`
          : `${leagueName}${isLeaders ? '數據統計' : '動態資料'}規劃中`}
      </div>
    </div>
  );
}

/* ─── 主元件 ─── */
export function BaseballStatsPanel({ league }: { league: string }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'leaders' | 'news'>('leaders');
  const leagueName = LEAGUE_NAMES[league] ?? league.toUpperCase();

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
      {/* 標題列：Tab 切換 + 展開/收起 */}
      <div className="flex items-center border-b border-transparent">
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
            <span>{leagueName}排行榜</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!expanded) setExpanded(true);
              setActiveTab('news');
            }}
            className={`px-3 py-2 text-sm font-semibold transition-colors flex items-center gap-2 ${
              expanded && activeTab === 'news'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-gray-600 hover:bg-gray-50 border-b-2 border-transparent'
            }`}
          >
            <span>📢</span>
            <span>最新動態</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {expanded ? '▲ 收起' : '▼ 展開'}
        </button>
      </div>

      {expanded && (
        <div className="px-3 pt-2 pb-3">
          {activeTab === 'leaders' ? <LeadersContent league={league} /> : <NewsContent league={league} />}
        </div>
      )}
    </div>
  );
}
