'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth';
import { useRouter } from 'next/navigation';
import { FeaturedPostCard, FEATURED_MOBILE_PREVIEW } from '@/components/board/FeaturedPostCard';
import { PostRow, type PostItem } from '@/components/board/PostRow';
import { LotteryBanner } from '@/components/lottery/LotteryBanner';
import { ScoreWidget } from '@/components/sports/ScoreWidget';
import { MLBGamesWidget } from '@/components/sports/mlb/MLBGamesWidget';
import { MLBStatsPanel } from '@/components/sports/mlb/MLBStatsPanel';
import { NBAStandingsWidget } from '@/components/sports/nba/NBAStandingsWidget';
import { NBASidePanel } from '@/components/sports/nba/NBASidePanel';
import { NBAGamesWidget } from '@/components/sports/nba/NBAGamesWidget';
import { BaseballGamesWidget } from '@/components/sports/BaseballGamesWidget';
import { BaseballStatsPanel } from '@/components/sports/BaseballStatsPanel';
import { BaseballStandingsWidget } from '@/components/sports/BaseballStandingsWidget';
import { BasketballGamesWidget } from '@/components/sports/basketball/BasketballGamesWidget';
import { BasketballStandingsWidget } from '@/components/sports/basketball/BasketballStandingsWidget';
import { CpblInjuriesWidget } from '@/components/sports/cpbl/CpblInjuriesWidget';
import { WorldCupActivityStrip } from '@/components/sports/world-cup/WorldCupActivityStrip';
import { FriendlyActivityStrip } from '@/components/sports/friendlies/FriendlyActivityStrip';
import { WorldCupMatchThreadShelf } from '@/components/sports/world-cup/WorldCupMatchThreadShelf';
import { GameIcon } from '@/components/lottery/GameIcon';
import { getMetaByBoardSlug } from '@/components/lottery/lottery-meta';

const NON_MLB_BASEBALL = new Set(['cpbl', 'npb', 'kbo', 'other-baseball']);

/** 最新新聞區桌機預設顯示篇數（手機用 FEATURED_MOBILE_PREVIEW=2）；超過用「查看全部新聞」就地展開 */
const NEWS_DESKTOP_PREVIEW = 4;

export interface BoardPostsResponse {
  data: {
    news: PostItem[];
    featured: PostItem[];
    discussion: {
      items: PostItem[];
      total: number;
      page: number;
      limit: number;
    };
  };
}

interface BoardData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: { id: string; name: string; slug: string };
  _count: { posts: number };
}

const SORT_OPTIONS = [
  { value: 'latest', label: '最新發文' },
  { value: 'lastReply', label: '最新回覆' },
  { value: 'popular', label: '最多推文' },
] as const;

export default function BoardPageClient({
  board,
  initialPosts,
}: {
  board: BoardData;
  initialPosts?: BoardPostsResponse;
}) {
  const { user, requireLogin, requirePhoneVerified } = useAuth();
  const router = useRouter();
  const [page, setPage] = useState(1);
  // 預設改為「最新回覆」：有人剛回的文章自動冒上來；沒人回的新文因 lastReplyAt = createdAt，也會依發表時間排入。
  const [sort, setSort] = useState<'latest' | 'lastReply' | 'popular'>('lastReply');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState('');

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: '20',
    sort,
    ...(activeTag && { tag: activeTag }),
    ...(searchQuery && { search: searchQuery }),
  });

  // 首屏預設狀態（page1 / limit20 / sort=lastReply / 無 tag / 無搜尋）才吃 SSR 種子，
  // 讓 server HTML 直接含 /post 內鏈（爬蟲 discovery）；切換分頁/排序/搜尋後改由 client 自行取得。
  const isInitialState = page === 1 && sort === 'lastReply' && !activeTag && !searchQuery;
  const { data, isLoading } = useQuery({
    queryKey: ['board-posts', board.slug, page, sort, activeTag, searchQuery],
    queryFn: () =>
      apiFetch<BoardPostsResponse>(
        `/boards/${board.slug}/posts?${queryParams.toString()}`,
      ),
    initialData: isInitialState ? initialPosts : undefined,
  });

  const news = data?.data.news ?? [];
  const featured = data?.data.featured ?? [];
  const posts = data?.data.discussion.items ?? [];
  const total = data?.data.discussion.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  // 行動裝置上 news / featured 預設只顯示前 N 篇，點「展開全部」才看更多
  const [newsExpanded, setNewsExpanded] = useState(false);
  const [featuredExpanded, setFeaturedExpanded] = useState(false);

  // 下半部討論區內的「置頂」文章（未來啟用 in-section pinning 時生效；目前都是 false）
  const { pinnedPosts, normalPosts } = useMemo(() => {
    const pinned = posts.filter((p) => p.isPinned);
    const normal = posts.filter((p) => !p.isPinned);
    return { pinnedPosts: pinned, normalPosts: normal };
  }, [posts]);

  // 篩選用標籤：依看板所屬分類撈「允許集合」，而非從現有貼文蒐集。
  // 後者會把歷史錯標的彩券標籤漏進體育板篩選列（Codex 對審指出的洞）。
  const { data: boardTagsRes } = useQuery({
    queryKey: ['board-tags', board.category.slug],
    queryFn: () =>
      apiFetch<{ data: { id: string; name: string; slug: string }[] }>(
        `/tags?category=${board.category.slug}`,
      ),
  });
  const allTags = boardTagsRes?.data ?? [];

  // 防禦：若 activeTag 不在此分類的允許清單內（例如切換看板後殘留），清掉避免「按鈕看不到卻仍在過濾」的空結果
  useEffect(() => {
    if (activeTag && allTags.length > 0 && !allTags.some((t) => t.slug === activeTag)) {
      setActiveTag('');
      setPage(1);
    }
  }, [allTags, activeTag]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
    setPage(1);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* 麵包屑 */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        <Link href="/" className="hover:text-blue-600">首頁</Link>
        <span>/</span>
        <span>{board.category.name}</span>
        <span>/</span>
        <span className="text-gray-900 font-medium">{board.name}</span>
      </nav>

      {/* 看板標題 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {(() => {
            const lotteryMeta = getMetaByBoardSlug(board.slug);
            if (lotteryMeta) return <GameIcon meta={lotteryMeta} size={48} />;
            if (board.slug === 'world-cup') {
              return (
                <Image
                  src="/images/world-cup/trophy.png"
                  alt=""
                  width={48}
                  height={48}
                  className="w-12 h-12 object-contain"
                />
              );
            }
            return <span className="text-3xl">{board.icon ?? '💬'}</span>;
          })()}
          <div>
            <h1 className="text-xl font-bold">{board.name}</h1>
            {board.description && (
              <p className="text-sm text-gray-500">{board.description}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => {
            if (!requireLogin()) return;
            if (!requirePhoneVerified()) return;
            router.push(`/board/${board.slug}/new`);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          發表文章
        </button>
      </div>

      {/* 彩券看板：開獎速報（各看板只顯示對應彩種） */}
      {board.slug === 'lotto649' && <LotteryBanner gameTypes={['LOTTO649']} />}
      {board.slug === 'super-lotto' && <LotteryBanner gameTypes={['SUPER_LOTTO']} />}
      {board.slug === 'daily-cash' && <LotteryBanner gameTypes={['DAILY539']} />}
      {board.slug === 'lotto1224' && <LotteryBanner gameTypes={['LOTTO1224']} />}
      {board.slug === 'star-lotto' && <LotteryBanner gameTypes={['LOTTO3D', 'LOTTO4D']} />}

      {/* 運動看板：即時比分與今日賽程 */}
      {/* MLB 使用官方 API（可點進詳情頁），其他聯賽用 API-Sports */}
      {board.slug === 'mlb' ? (
        <>
          <MLBGamesWidget />
          {/* 合併為單一 Tab 面板，避免並排時高度不對稱 */}
          <MLBStatsPanel />
        </>
      ) : NON_MLB_BASEBALL.has(board.slug) ? (
        <>
          {/* 視覺與 MLB 同步：橫向滾動賽事卡 + Tab 整合的排行榜/動態面板 */}
          <BaseballGamesWidget league={board.slug} />
          {/* 戰績排行榜：CPBL / NPB / KBO / 其他棒球(LMB) 皆有 API-Sports 資料（NPB 自動分央聯/太平洋聯盟） */}
          <BaseballStandingsWidget league={board.slug} />
          {/* 傷兵動態：CPBL 專屬（爬 cpbl.com.tw）；NPB/KBO 暫無傷兵資料源 */}
          {board.slug === 'cpbl' && <CpblInjuriesWidget />}
          {/* 排行榜/動態面板：僅 CPBL/NPB/KBO 有官網爬蟲；other-baseball(LMB) 無 leaders 源，故略過 */}
          {board.slug !== 'other-baseball' && <BaseballStatsPanel league={board.slug} />}
        </>
      ) : board.slug === 'nba' ? (
        <>
          <NBAGamesWidget />
          <div className="grid md:grid-cols-3 gap-3 mb-4">
            <div className="md:col-span-2">
              <NBAStandingsWidget />
            </div>
            <div>
              <NBASidePanel />
            </div>
          </div>
        </>
      ) : board.category?.slug === 'basketball' && board.slug !== 'nba' && board.slug !== 'other-basketball' ? (
        <>
          {/* 通用籃球（API-Sports 各聯賽 + TPBL 官方源）：三日賽事 + 戰績排行，能力驅動共用一套 widget */}
          <BasketballGamesWidget league={board.slug} leagueName={board.name} />
          <BasketballStandingsWidget league={board.slug} leagueName={board.name} />
        </>
      ) : board.slug === 'world-cup' ? (
        <>
          <WorldCupActivityStrip />
          <WorldCupMatchThreadShelf posts={posts} />
        </>
      ) : board.slug === 'friendlies' ? (
        <FriendlyActivityStrip />
      ) : (
        <ScoreWidget boardSlug={board.slug} />
      )}

      {/* 搜尋列 */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="搜尋看板內文章..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
        >
          搜尋
        </button>
        {searchQuery && (
          <button
            type="button"
            onClick={() => { setSearchInput(''); setSearchQuery(''); setPage(1); }}
            className="px-3 py-2 text-gray-400 hover:text-gray-600 text-sm"
          >
            清除
          </button>
        )}
      </form>

      {/* 排序 + Tag 篩選 */}
      <div className="flex items-center gap-2 mb-4 border-b border-gray-200 pb-3 flex-wrap">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setSort(opt.value); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              sort === opt.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {opt.label}
          </button>
        ))}

        {allTags.length > 0 && (
          <>
            <span className="text-gray-300 mx-1">|</span>
            {allTags.map((tag) => (
              <button
                key={tag.slug}
                onClick={() => { setActiveTag(activeTag === tag.slug ? '' : tag.slug); setPage(1); }}
                className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                  activeTag === tag.slug
                    ? 'bg-blue-100 text-blue-600 font-medium'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                #{tag.name}
              </button>
            ))}
          </>
        )}

        <span className="ml-auto text-sm text-gray-400">
          共 {total} 篇文章
        </span>
      </div>

      {/* === 上半部置頂區：最新新聞 + 站方公告（皆 0 篇隱藏整區） === */}
      {(news.length > 0 || featured.length > 0) && (
        <section className="mb-6">
          {/* 最新新聞（NEWS）：新聞 agent 審核通過後落這 */}
          {news.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 px-1 text-[11px] font-medium text-blue-500">
                📰 最新新聞
              </div>
              {/* 桌機預設 4 篇、手機預設 2 篇；超過的用「查看全部新聞」就地展開（NEWS 上限 20） */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {news.map((post, i) => (
                  <div
                    key={post.id}
                    className={
                      newsExpanded
                        ? ''
                        : i < FEATURED_MOBILE_PREVIEW
                          ? ''
                          : i < NEWS_DESKTOP_PREVIEW
                            ? 'hidden md:block'
                            : 'hidden'
                    }
                  >
                    <FeaturedPostCard post={post} league={board.slug} />
                  </div>
                ))}
              </div>
              {news.length > FEATURED_MOBILE_PREVIEW && (
                <div
                  className={`mt-2 flex md:justify-end ${
                    news.length <= NEWS_DESKTOP_PREVIEW ? 'md:hidden' : ''
                  }`}
                >
                  <button
                    onClick={() => setNewsExpanded((v) => !v)}
                    className="inline-flex items-center justify-center gap-1 w-full md:w-auto py-2 md:py-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    {newsExpanded ? (
                      <>
                        收合新聞 <span aria-hidden>↑</span>
                      </>
                    ) : (
                      <>
                        查看全部新聞
                        <span className="font-normal text-slate-400">
                          （共 {news.length} 篇）
                        </span>
                        <span aria-hidden>→</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 站方公告（FEATURED）：站方手動置頂 / 彩券公告等 */}
          {featured.length > 0 && (
            <div>
              {/* 同時有新聞時才標題區分，避免單一區塊時多餘 label */}
              {news.length > 0 && (
                <div className="mb-2 px-1 text-[11px] font-medium text-orange-500">
                  📣 站方公告
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {featured
                  .slice(0, featuredExpanded ? featured.length : Number.POSITIVE_INFINITY)
                  .map((post, i) => (
                    <div
                      key={post.id}
                      className={
                        !featuredExpanded && i >= FEATURED_MOBILE_PREVIEW
                          ? 'hidden md:block'
                          : ''
                      }
                    >
                      <FeaturedPostCard post={post} variant="announcement" />
                    </div>
                  ))}
              </div>
              {featured.length > FEATURED_MOBILE_PREVIEW && !featuredExpanded && (
                <button
                  onClick={() => setFeaturedExpanded(true)}
                  className="md:hidden mt-2 w-full py-2 text-xs text-slate-500 hover:text-slate-700 border border-dashed border-slate-300 rounded-lg"
                >
                  展開全部站方公告（還有 {featured.length - FEATURED_MOBILE_PREVIEW} 篇）
                </button>
              )}
            </div>
          )}

          {/* 區塊分隔：極小灰字 label，不放分隔線、不放大標題 */}
          <div className="mt-6 mb-2 text-[11px] text-gray-400 px-1">
            以下為玩家討論
          </div>
        </section>
      )}

      {/* === 下半部：玩家討論 === */}
      {isLoading ? (
        <div className="text-center py-20 text-gray-400">載入中...</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          {searchQuery || activeTag
            ? '找不到符合條件的文章'
            : news.length > 0 || featured.length > 0
              ? '目前還沒有玩家討論，來發表第一篇吧！'
              : '此看板尚無文章，來發表第一篇吧！'}
        </div>
      ) : (
        <>
          {/* 討論區內的置頂（保留未來擴充） */}
          {pinnedPosts.length > 0 && (
            <div className="space-y-2 mb-3">
              {pinnedPosts.map((post) => (
                <PostRow key={post.id} post={post} />
              ))}
            </div>
          )}

          {/* 一般討論 */}
          <div className="space-y-2">
            {normalPosts.map((post) => (
              <PostRow key={post.id} post={post} />
            ))}
          </div>
        </>
      )}

      {/* 分頁 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6 pb-4">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 rounded border text-sm disabled:opacity-30 hover:bg-gray-50"
          >
            上一頁
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 rounded border text-sm disabled:opacity-30 hover:bg-gray-50"
          >
            下一頁
          </button>
        </div>
      )}
    </div>
  );
}
