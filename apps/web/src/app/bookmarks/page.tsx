'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth';
import { apiFetch } from '@/lib/api';

interface BookmarkItem {
  id: string;
  createdAt: string;
  post: {
    id: string;
    title: string;
    viewCount: number;
    replyCount: number;
    createdAt: string;
    author: { id: string; nickname: string };
    board: { id: string; name: string; slug: string };
  };
}

interface BookmarksResponse {
  data: { items: BookmarkItem[]; total: number; page: number; limit: number };
}

type SortKey = 'bookmarkTime' | 'postTime' | 'replies';

export default function BookmarksPage() {
  const { user, accessToken, requireLogin } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortKey>('bookmarkTime');

  const { data, isLoading } = useQuery({
    queryKey: ['bookmarks', page],
    queryFn: () =>
      apiFetch<BookmarksResponse>(`/bookmarks?page=${page}&limit=20`, {
        token: accessToken ?? undefined,
      }),
    enabled: !!accessToken,
  });

  const removeMutation = useMutation({
    mutationFn: (postId: string) =>
      apiFetch(`/bookmarks/${postId}`, { method: 'DELETE', token: accessToken ?? undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });

  const rawItems = data?.data.items ?? [];
  const items = [...rawItems].sort((a, b) => {
    if (sortBy === 'postTime') return new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime();
    if (sortBy === 'replies') return b.post.replyCount - a.post.replyCount;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // bookmarkTime
  });
  const total = data?.data.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p className="text-gray-400 mb-2">登入後即可查看你的收藏</p>
        <button onClick={requireLogin} className="text-blue-600 hover:underline font-medium">立即登入</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">我的收藏</h1>
        <div className="flex gap-1">
          {([['bookmarkTime', '收藏時間'], ['postTime', '發文時間'], ['replies', '回覆數']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`px-3 py-1 rounded-full text-xs transition-colors ${
                sortBy === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-400">載入中...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 mb-2">還沒有收藏任何文章</p>
          <Link href="/" className="text-blue-600 hover:underline text-sm">去看看有什麼有趣的討論</Link>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {items.map((bm) => (
            <div
              key={bm.id}
              className="flex items-start gap-3 py-3 px-2 hover:bg-gray-50 rounded transition-colors"
            >
              <Link href={`/post/${bm.post.id}`} className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 mb-1">{bm.post.title}</div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="text-blue-500">{bm.post.board.name}</span>
                  <span>{bm.post.author.nickname}</span>
                  <span>{new Date(bm.post.createdAt).toLocaleDateString('zh-TW')}</span>
                </div>
              </Link>
              <div className="flex items-center gap-3 text-xs text-gray-400 shrink-0">
                <span className="hidden sm:inline">回覆 {bm.post.replyCount}</span>
                <span className="hidden sm:inline">瀏覽 {bm.post.viewCount}</span>
                <button
                  onClick={() => {
                    if (confirm('確定要移除此收藏嗎？')) removeMutation.mutate(bm.post.id);
                  }}
                  disabled={removeMutation.isPending}
                  className="text-red-400 hover:text-red-600 transition-colors ml-1"
                  title="移除收藏"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded border text-sm disabled:opacity-30 hover:bg-gray-50">上一頁</button>
          <span className="px-3 py-1.5 text-sm text-gray-500">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded border text-sm disabled:opacity-30 hover:bg-gray-50">下一頁</button>
        </div>
      )}
    </div>
  );
}
