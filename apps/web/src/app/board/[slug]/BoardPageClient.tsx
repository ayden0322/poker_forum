'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth';
import { useRouter } from 'next/navigation';
import { LotteryBanner } from '@/components/lottery/LotteryBanner';
import { ScoreWidget } from '@/components/sports/ScoreWidget';
import { MLBGamesWidget } from '@/components/sports/mlb/MLBGamesWidget';
import { MLBStatsPanel } from '@/components/sports/mlb/MLBStatsPanel';
import { BaseballGamesWidget } from '@/components/sports/BaseballGamesWidget';
import { BaseballStatsPanel } from '@/components/sports/BaseballStatsPanel';

const NON_MLB_BASEBALL = new Set(['cpbl', 'npb', 'kbo']);

interface PostItem {
  id: string;
  title: string;
  isPinned: boolean;
  isLocked: boolean;
  isAnnounce: boolean;
  viewCount: number;
  replyCount: number;
  pushCount: number;
  lastReplyAt: string | null;
  createdAt: string;
  author: {
    id: string;
    nickname: string;
    avatar: string | null;
    level: number;
    role: string;
  };
  tags: { tag: { id: string; name: string; slug: string } }[];
  _count: { replies: number; pushes: number };
}

interface BoardPostsResponse {
  data: {
    items: PostItem[];
    total: number;
    page: number;
    limit: number;
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

/** 相對時間格式化：剛剛 / N 分鐘前 / N 小時前 / N 天前 / 日期 */
function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '剛剛';
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(iso).toLocaleDateString('zh-TW');
}

/** 數字縮寫：1234 → 1.2k */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.floor(n / 1000)}k`;
}

function PostRow({ post }: { post: PostItem }) {
  const isHot = post.pushCount >= 10 || post._count.replies >= 20;
  const roleBadge =
    post.author.role === 'ADMIN'
      ? { label: '管理員', cls: 'bg-red-100 text-red-600' }
      : post.author.role === 'MOD'
      ? { label: '板主', cls: 'bg-purple-100 text-purple-600' }
      : null;

  return (
    <Link
      href={`/post/${post.id}`}
      className={`group relative block bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 ${
        post.isPinned ? 'border-l-4 border-l-red-400' : isHot ? 'border-l-4 border-l-orange-400' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {/* 作者頭像 */}
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-600 text-base font-semibold shrink-0 overflow-hidden ring-2 ring-white shadow-sm">
          {post.author.avatar ? (
            <img src={post.author.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            post.author.nickname.charAt(0)
          )}
        </div>

        {/* 主要內容 */}
        <div className="flex-1 min-w-0">
          {/* 標籤列 */}
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            {post.isPinned && (
              <span className="text-[11px] bg-red-500 text-white px-2 py-0.5 rounded-full font-medium">
                📌 置頂
              </span>
            )}
            {post.isAnnounce && (
              <span className="text-[11px] bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full font-medium">
                📣 公告
              </span>
            )}
            {isHot && !post.isPinned && (
              <span className="text-[11px] bg-gradient-to-r from-orange-400 to-red-500 text-white px-2 py-0.5 rounded-full font-medium">
                🔥 熱門
              </span>
            )}
            {post.isLocked && (
              <span className="text-[11px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                🔒 鎖定
              </span>
            )}
            {post.tags.slice(0, 3).map((t) => (
              <span
                key={t.tag.id}
                className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full"
              >
                #{t.tag.name}
              </span>
            ))}
          </div>

          {/* 標題 */}
          <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug mb-1.5">
            {post.title}
          </h3>

          {/* 底部資訊列 */}
          <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
            <span className="font-medium text-gray-700">{post.author.nickname}</span>
            {roleBadge && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${roleBadge.cls}`}>
                {roleBadge.label}
              </span>
            )}
            <span className="text-gray-300">·</span>
            <span>發表於 {formatRelativeTime(post.createdAt)}</span>
            {post.lastReplyAt && post.lastReplyAt !== post.createdAt && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-blue-600">
                  最後回覆 {formatRelativeTime(post.lastReplyAt)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* 右側統計 */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {/* 回覆數 pill（主要） */}
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
              post._count.replies > 0
                ? 'bg-blue-50 text-blue-600'
                : 'bg-gray-50 text-gray-400'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span>{formatCount(post._count.replies)}</span>
          </div>
          {/* 瀏覽 / 推文（次要） */}
          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            <span className="flex items-center gap-0.5">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {formatCount(post.viewCount)}
            </span>
            {post.pushCount > 0 && (
              <span className="flex items-center gap-0.5 text-orange-500">
                ▲ {formatCount(post.pushCount)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function BoardPageClient({ board }: { board: BoardData }) {
  const { user, requireLogin, requirePhoneVerified } = useAuth();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'latest' | 'lastReply' | 'popular'>('latest');
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

  const { data, isLoading } = useQuery({
    queryKey: ['board-posts', board.slug, page, sort, activeTag, searchQuery],
    queryFn: () =>
      apiFetch<BoardPostsResponse>(
        `/boards/${board.slug}/posts?${queryParams.toString()}`,
      ),
  });

  const posts = data?.data.items ?? [];
  const total = data?.data.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  // 分離置頂與一般文章
  const { pinnedPosts, normalPosts } = useMemo(() => {
    const pinned = posts.filter((p) => p.isPinned);
    const normal = posts.filter((p) => !p.isPinned);
    return { pinnedPosts: pinned, normalPosts: normal };
  }, [posts]);

  // 收集所有出現的 tag（用於篩選按鈕）
  const allTags = useMemo(() => {
    const tagMap = new Map<string, { id: string; name: string; slug: string }>();
    posts.forEach((p) =>
      p.tags.forEach((t) => tagMap.set(t.tag.slug, t.tag))
    );
    return Array.from(tagMap.values());
  }, [posts]);

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
          <span className="text-3xl">{board.icon ?? '💬'}</span>
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
          <BaseballStatsPanel league={board.slug} />
        </>
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

      {/* 文章列表 */}
      {isLoading ? (
        <div className="text-center py-20 text-gray-400">載入中...</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          {searchQuery || activeTag ? '找不到符合條件的文章' : '此看板尚無文章，來發表第一篇吧！'}
        </div>
      ) : (
        <>
          {/* 置頂文章 */}
          {pinnedPosts.length > 0 && (
            <div className="space-y-2 mb-3">
              {pinnedPosts.map((post) => (
                <PostRow key={post.id} post={post} />
              ))}
            </div>
          )}

          {/* 一般文章 */}
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
