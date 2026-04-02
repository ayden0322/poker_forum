import { apiFetch } from '@/lib/api';
import { notFound } from 'next/navigation';
import BoardPageClient from './BoardPageClient';

interface BoardData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: { id: string; name: string; slug: string };
  _count: { posts: number };
}

interface BoardResponse {
  data: BoardData;
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  try {
    const res = await apiFetch<BoardResponse>(`/boards/${params.slug}`);
    return {
      title: `${res.data.name} - 博客邦`,
      description: res.data.description ?? `${res.data.name} 討論看板`,
    };
  } catch {
    return { title: '看板不存在 - 博客邦' };
  }
}

export default async function BoardPage({ params }: { params: { slug: string } }) {
  let board: BoardData;
  try {
    const res = await apiFetch<BoardResponse>(`/boards/${params.slug}`);
    board = res.data;
  } catch {
    notFound();
  }

  return <BoardPageClient board={board} />;
}
