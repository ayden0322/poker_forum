'use client';

import { useState } from 'react';
import Link from 'next/link';

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

/** 分類圖示對照 */
const CATEGORY_ICON: Record<string, string> = {
  basketball: '🏀',
  soccer: '⚽',
  baseball: '⚾',
  'other-sports': '🏆',
  lottery: '🎰',
  general: '💬',
};

export function CategorySection({ category }: { category: Category }) {
  const [collapsed, setCollapsed] = useState(false);
  const icon = CATEGORY_ICON[category.slug] ?? '📋';

  return (
    <section className="mb-6">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between bg-gray-800 text-white px-4 py-2.5 rounded-t-lg hover:bg-gray-700 transition-colors"
      >
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span>{icon}</span>
          <span>{category.name}</span>
          <span className="text-sm font-normal text-gray-400">
            ({category.boards.length})
          </span>
        </h2>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
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
      )}
    </section>
  );
}
