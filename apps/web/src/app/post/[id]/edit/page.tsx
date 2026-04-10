'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/context/auth';
import { apiFetch } from '@/lib/api';

const RichTextEditor = dynamic(() => import('@/components/editor/RichTextEditor'), { ssr: false });

interface PostData {
  id: string;
  title: string;
  content: string;
  author: { id: string };
  board: { name: string; slug: string; category: { name: string } };
  tags: { tag: { id: string; name: string } }[];
}

export default function EditPostPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [post, setPost] = useState<PostData | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [editorReady, setEditorReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/');
      return;
    }

    apiFetch<{ data: PostData }>(`/posts/${id}`)
      .then((res) => {
        const p = res.data;
        if (p.author.id !== user.id && user.role !== 'ADMIN' && user.role !== 'MODERATOR') {
          router.replace(`/post/${id}`);
          return;
        }
        setPost(p);
        setTitle(p.title);
        setContent(p.content);
        setEditorReady(true);
      })
      .catch(() => setError('無法載入文章'))
      .finally(() => setLoading(false));
  }, [id, user, authLoading, router]);

  const isContentEmpty = !content || content === '<p></p>' || content.replace(/<[^>]*>/g, '').trim() === '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isContentEmpty) return;

    setSaving(true);
    setError('');
    try {
      await apiFetch(`/posts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: title.trim(), content }),
      });
      router.push(`/post/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return <div className="text-center py-20 text-gray-400">載入中...</div>;
  }

  if (error && !post) {
    return <div className="text-center py-20 text-red-500">{error}</div>;
  }

  if (!post) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        <Link href="/" className="hover:text-blue-600">首頁</Link>
        <span>/</span>
        <span>{post.board.category.name}</span>
        <span>/</span>
        <Link href={`/board/${post.board.slug}`} className="hover:text-blue-600">{post.board.name}</Link>
        <span>/</span>
        <Link href={`/post/${id}`} className="hover:text-blue-600 truncate max-w-[150px]">{post.title}</Link>
        <span>/</span>
        <span className="text-gray-900">編輯</span>
      </nav>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h1 className="text-xl font-bold mb-6">編輯文章</h1>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">標題</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={100}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">內容</label>
            {editorReady && (
              <RichTextEditor
                content={content}
                onChange={setContent}
                placeholder="請輸入文章內容..."
                minHeight="300px"
              />
            )}
          </div>

          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || !title.trim() || isContentEmpty}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
            >
              {saving ? '儲存中...' : '儲存修改'}
            </button>
            <Link
              href={`/post/${id}`}
              className="px-6 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
