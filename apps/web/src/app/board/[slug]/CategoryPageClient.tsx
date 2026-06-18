'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { FeaturedPostCard } from '@/components/board/FeaturedPostCard';
import { PostRow, type PostItem } from '@/components/board/PostRow';

export interface CategoryData {
  id: string;
  name: string;
  slug: string;
  boards: { id: string; name: string; slug: string; postCount: number }[];
  _count: { posts: number };
}

interface CategoryPostsResponse {
  data: {
    news: PostItem[];
    featured: PostItem[];
    discussion: { items: PostItem[]; total: number; page: number; limit: number };
  };
}

const SORT_OPTIONS = [
  { value: 'lastReply', label: '最新回覆' },
  { value: 'latest', label: '最新發文' },
  { value: 'popular', label: '最多推文' },
] as const;

const LIMIT = 20;

export default function CategoryPageClient({ category }: { category: CategoryData }) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'latest' | 'lastReply' | 'popular'>('lastReply');

  const query = new URLSearchParams({ page: String(page), limit: String(LIMIT), sort });
  const { data, isLoading } = useQuery({
    queryKey: ['category-posts', category.slug, page, sort],
    queryFn: () => apiFetch<CategoryPostsResponse>(`/boards/categories/${category.slug}/posts?${query.toString()}`),
  });

  const news = data?.data.news ?? [];
  const posts = data?.data.discussion.items ?? [];
  const total = data?.data.discussion.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  const [newsExpanded, setNewsExpanded] = useState(false);
  const NEWS_PREVIEW = 4;
  const shownNews = newsExpanded ? news : news.slice(0, NEWS_PREVIEW);

  return (
    <div className="max-w-4xl mx-auto">
      {/* 麵包屑 */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1.5">
        <Link href="/" className="hover:text-blue-600">首頁</Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-900 font-medium">{category.name}</span>
      </nav>

      {/* 標題區：色條 H1 + 副說明 + 排序 */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <span className="w-1 h-6 rounded-full bg-blue-600" />
            {category.name}
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            彙整 {category.boards.map((b) => b.name).join('、')} 的最新新聞與討論，共{' '}
            <b className="text-gray-700">{category._count.posts}</b> 篇
          </p>
        </div>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as typeof sort);
            setPage(1);
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* 子看板導覽 chips（全部=當前；各聯盟連到該看板頁） */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
        <span className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold bg-blue-600 text-white">全部</span>
        {category.boards.map((b) => (
          <Link
            key={b.id}
            href={`/board/${b.slug}`}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            {b.name}
          </Link>
        ))}
      </div>

      {/* 最新新聞（聚合） */}
      {news.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 px-1 text-[11px] font-medium text-blue-500">📰 最新新聞</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {shownNews.map((post) => (
              <FeaturedPostCard key={post.id} post={post} league={post.board?.slug} />
            ))}
          </div>
          {news.length > NEWS_PREVIEW && (
            <div className="mt-2 flex md:justify-end">
              <button
                onClick={() => setNewsExpanded((v) => !v)}
                className="inline-flex items-center gap-1 w-full md:w-auto py-2 md:py-1 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                {newsExpanded ? '收合新聞 ↑' : `查看全部新聞（共 ${news.length} 篇）→`}
              </button>
            </div>
          )}
          <div className="mt-6 mb-2 text-[11px] text-gray-400 px-1">以下為玩家討論</div>
        </section>
      )}

      {/* 玩家討論（聚合，每篇標聯盟） */}
      {isLoading ? (
        <div className="text-center py-20 text-gray-400">載入中...</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          這個分類還沒有玩家討論，挑一個聯盟看板來發表第一篇吧！
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <PostRow key={post.id} post={post} showBoardBadge />
          ))}
        </div>
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
          <span className="px-3 py-1.5 text-sm text-gray-500">{page} / {totalPages}</span>
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
