'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface PostItem {
  id: string;
  title: string;
  viewCount: number;
  createdAt: string;
  author: { id: string; nickname: string; avatar: string | null; level: number };
  board: { id: string; name: string; slug: string };
  tags: { tag: { id: string; name: string } }[];
  _count: { replies: number; pushes: number };
}

interface BoardItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: { id: string; name: string; slug: string };
  _count: { posts: number };
}

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  _count: { boards: number };
}

interface SearchResponse {
  data: {
    boards: BoardItem[];
    categories: CategoryItem[];
    posts: { items: PostItem[]; total: number; page: number; limit: number };
  };
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-gray-400">載入中...</div>}>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQ);
  const [searchTerm, setSearchTerm] = useState(initialQ);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['search', searchTerm, page],
    queryFn: () =>
      apiFetch<SearchResponse>(`/search?q=${encodeURIComponent(searchTerm)}&page=${page}&limit=20`),
    enabled: !!searchTerm,
  });

  const boards = data?.data.boards ?? [];
  const categories = data?.data.categories ?? [];
  const posts = data?.data.posts.items ?? [];
  const total = data?.data.posts.total ?? 0;
  const totalPages = Math.ceil(total / 20);
  const hasAnyResult = boards.length > 0 || categories.length > 0 || posts.length > 0;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTerm(query);
    setPage(1);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4">搜尋</h1>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="輸入關鍵字搜尋區塊、分類或文章..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
        <button
          type="submit"
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          搜尋
        </button>
      </form>

      {!searchTerm ? (
        <div className="text-center py-20 text-gray-400">請輸入關鍵字開始搜尋</div>
      ) : isLoading ? (
        <div className="text-center py-20 text-gray-400">搜尋中...</div>
      ) : !hasAnyResult ? (
        <div className="text-center py-20 text-gray-400">
          找不到「{searchTerm}」相關結果
        </div>
      ) : (
        <div className="space-y-8">
          {boards.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-gray-800 mb-3">
                相關區塊 <span className="text-sm text-gray-400">({boards.length})</span>
              </h2>
              <div className="grid sm:grid-cols-2 gap-2">
                {boards.map((board) => (
                  <Link
                    key={board.id}
                    href={`/board/${board.slug}`}
                    className="flex items-center gap-3 px-3 py-3 border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
                  >
                    <span className="text-2xl w-10 text-center shrink-0">{board.icon ?? '💬'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{board.name}</div>
                      {board.description && (
                        <div className="text-xs text-gray-500 truncate">{board.description}</div>
                      )}
                      <div className="text-xs text-gray-400 mt-0.5">
                        {board.category.name} · {board._count.posts} 篇文章
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {categories.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-gray-800 mb-3">
                相關分類 <span className="text-sm text-gray-400">({categories.length})</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/#category-${cat.slug}`}
                    className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
                  >
                    <span className="font-medium text-gray-900">{cat.name}</span>
                    <span className="text-xs text-gray-400">{cat._count.boards} 個區塊</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-3">
              相關文章 <span className="text-sm text-gray-400">({total})</span>
            </h2>
            {posts.length === 0 ? (
              <div className="text-sm text-gray-400 py-6 text-center">沒有相關文章</div>
            ) : (
              <>
                <div className="divide-y divide-gray-100">
                  {posts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/post/${post.id}`}
                      className="flex items-start gap-3 py-3 px-2 hover:bg-gray-50 rounded transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 mb-1">{post.title}</div>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          <span className="text-blue-500">{post.board.name}</span>
                          <span>{post.author.nickname}</span>
                          <span>{new Date(post.createdAt).toLocaleDateString('zh-TW')}</span>
                          {post.tags.length > 0 && (
                            <div className="flex gap-1">
                              {post.tags.map((t) => (
                                <span key={t.tag.id} className="text-blue-400">#{t.tag.name}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 shrink-0">
                        <span>回覆 {post._count.replies}</span>
                        <span>瀏覽 {post.viewCount}</span>
                      </div>
                    </Link>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex justify-center gap-2 mt-6">
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
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
