import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface MarqueeItem {
  id: string;
  content: string;
  url: string | null;
}

interface Board {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  _count: { posts: number };
}

interface Category {
  id: string;
  name: string;
  slug: string;
  boards: Board[];
}

interface CategoriesResponse {
  data: Category[];
}

export const revalidate = 60;

export default async function HomePage() {
  let categories: Category[] = [];
  let marquees: MarqueeItem[] = [];
  try {
    const [catRes, marqRes] = await Promise.all([
      apiFetch<CategoriesResponse>('/boards/categories'),
      apiFetch<{ data: MarqueeItem[] }>('/boards/marquees'),
    ]);
    categories = catRes.data;
    marquees = marqRes.data;
  } catch {
    // API 可能尚未啟動
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: '博客邦',
    description: '亞洲最大賽事論壇 - 博客邦',
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://forum.example.com',
  };

  return (
    <div className="max-w-4xl mx-auto">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">博客邦</h1>
        <p className="text-gray-500">亞洲最大賽事論壇</p>
      </div>

      {marquees.length > 0 && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2.5 overflow-hidden">
          <div className="flex items-center gap-3 animate-marquee">
            <span className="text-yellow-600 font-medium shrink-0">📢 最新</span>
            <div className="flex items-center gap-6 text-sm text-yellow-800">
              {marquees.map((m) =>
                m.url ? (
                  <a key={m.id} href={m.url} className="hover:underline shrink-0">{m.content}</a>
                ) : (
                  <span key={m.id} className="shrink-0">{m.content}</span>
                ),
              )}
            </div>
          </div>
        </div>
      )}

      {categories.length === 0 && (
        <div className="text-center text-gray-400 py-20">
          論壇正在準備中，請稍後再回來看看
        </div>
      )}

      {categories.map((category) => (
        <section key={category.id} className="mb-8">
          <h2 className="text-lg font-bold bg-gray-800 text-white px-4 py-2.5 rounded-t-lg">
            {category.name}
          </h2>
          <div className="border border-t-0 border-gray-200 rounded-b-lg divide-y divide-gray-100">
            {category.boards.map((board) => (
              <Link
                key={board.id}
                href={`/board/${board.slug}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <span className="text-2xl w-10 text-center">{board.icon ?? '💬'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{board.name}</div>
                  {board.description && (
                    <div className="text-sm text-gray-500 truncate">{board.description}</div>
                  )}
                </div>
                <div className="text-sm text-gray-400 shrink-0">
                  {board._count.posts} 篇文章
                </div>
              </Link>
            ))}
            {category.boards.length === 0 && (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">
                此分類尚無看板
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
