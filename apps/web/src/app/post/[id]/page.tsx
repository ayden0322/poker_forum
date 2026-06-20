import { apiFetch } from '@/lib/api';
import { notFound } from 'next/navigation';
import PostDetailClient from './PostDetailClient';

interface PostData {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  isLocked: boolean;
  section?: 'NEWS' | 'FEATURED' | 'DISCUSSION';
  viewCount: number;
  replyCount: number;
  pushCount: number;
  createdAt: string;
  updatedAt: string;
  author: { id: string; nickname: string; avatar: string | null; level: number; role: string };
  board: { id: string; name: string; slug: string; category: { id: string; name: string } };
  tags: { tag: { id: string; name: string; slug: string } }[];
  _count: { replies: number; pushes: number; bookmarks: number };
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  try {
    const res = await apiFetch<{ data: PostData }>(`/posts/${params.id}`);
    return {
      title: `${res.data.title} - ${res.data.board.name} - 博客邦`,
      description: res.data.content.substring(0, 150),
    };
  } catch {
    return { title: '文章不存在 - 博客邦' };
  }
}

export default async function PostPage({ params }: { params: { id: string } }) {
  let post: PostData;
  try {
    // no-store：作者裝飾(框/稱號/勳章)會隨裝備變動，文章詳情不可吃 Next Data Cache 舊值
    const res = await apiFetch<{ data: PostData }>(`/posts/${params.id}`, { cache: 'no-store' });
    post = res.data;
  } catch {
    notFound();
  }

  return <PostDetailClient post={post} />;
}
