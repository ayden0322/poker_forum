'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth';
import { useRouter } from 'next/navigation';
import { LotteryBanner } from '@/components/lottery/LotteryBanner';

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

function PostRow({ post }: { post: PostItem }) {
  return (
    <Link
      href={`/post/${post.id}`}
      className="flex items-start gap-3 py-3 px-2 hover:bg-gray-50 rounded transition-colors"
    >
      {/* 作者頭像 */}
      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm shrink-0 overflow-hidden">
        {post.author.avatar ? (
          <img src={post.author.avatar} alt="" className="w-full h-full object-cover" />
        ) : (
          post.author.nickname.charAt(0)
        )}
      </div>

      {/* 文章資訊 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {post.isPinned && (
            <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">
              置頂
            </span>
          )}
          {post.isAnnounce && (
            <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">
              公告
            </span>
          )}
          {post.isLocked && (
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
              🔒
            </span>
          )}
          <span className="font-medium text-gray-900 truncate">{post.title}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>{post.author.nickname}</span>
          <span>{new Date(post.createdAt).toLocaleDateString('zh-TW')}</span>
          {post.tags.length > 0 && (
            <div className="flex gap-1">
              {post.tags.map((t) => (
                <span key={t.tag.id} className="text-blue-500">#{t.tag.name}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 統計 */}
      <div className="flex items-center gap-4 text-xs text-gray-400 shrink-0">
        <div className="text-center">
          <div className="font-medium text-gray-600">{post._count.replies}</div>
          <div>回覆</div>
        </div>
        <div className="text-center">
          <div className="font-medium text-gray-600">{post.viewCount}</div>
          <div>瀏覽</div>
        </div>
      </div>
    </Link>
  );
}

export default function BoardPageClient({ board }: { board: BoardData }) {
  const { user, requireLogin } = useAuth();
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
            if (requireLogin()) router.push(`/board/${board.slug}/new`);
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
            <div className="mb-2 bg-red-50/50 border border-red-100 rounded-lg overflow-hidden">
              <div className="divide-y divide-red-100/50">
                {pinnedPosts.map((post) => (
                  <PostRow key={post.id} post={post} />
                ))}
              </div>
            </div>
          )}

          {/* 一般文章 */}
          <div className="divide-y divide-gray-100">
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
