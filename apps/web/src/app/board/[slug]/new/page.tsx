'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth';
import { apiFetch } from '@/lib/api';

interface Tag {
  id: string;
  name: string;
  slug: string;
}

interface Board {
  id: string;
  name: string;
  slug: string;
}

export default function NewPostPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const { user, accessToken: token } = useAuth();

  const [board, setBoard] = useState<Board | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ data: Board }>(`/boards/${slug}`)
      .then((res) => setBoard(res.data))
      .catch(() => router.push('/'));

    apiFetch<{ data: Tag[] }>('/tags')
      .then((res) => setTags(res.data))
      .catch(() => {});
  }, [slug, router]);

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !token) {
      setError('請先登入');
      return;
    }
    if (!board) return;

    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ data: { id: string } }>('/posts', {
        method: 'POST',
        token,
        body: JSON.stringify({
          boardId: board.id,
          title,
          content,
          tagIds: selectedTags.length > 0 ? selectedTags : undefined,
        }),
      });
      router.push(`/post/${res.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '發文失敗');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p className="text-gray-500 mb-4">請先登入才能發表文章</p>
        <Link href="/" className="text-blue-600 hover:underline">返回首頁</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        <Link href="/" className="hover:text-blue-600">首頁</Link>
        <span>/</span>
        <Link href={`/board/${slug}`} className="hover:text-blue-600">{board?.name ?? slug}</Link>
        <span>/</span>
        <span className="text-gray-900">發表文章</span>
      </nav>

      <h1 className="text-xl font-bold mb-6">發表文章</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">標題</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="請輸入文章標題"
          />
          <div className="text-xs text-gray-400 mt-1 text-right">{title.length}/100</div>
        </div>

        {tags.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">標籤（選填）</label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    selectedTags.includes(tag.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  #{tag.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">內容</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={15}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
            placeholder="請輸入文章內容..."
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading || !title.trim() || !content.trim()}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '發表中...' : '發表文章'}
          </button>
          <Link
            href={`/board/${slug}`}
            className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
