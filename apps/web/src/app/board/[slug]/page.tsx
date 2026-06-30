import { apiFetch } from '@/lib/api';
import { notFound } from 'next/navigation';
import BoardPageClient, { type BoardPostsResponse } from './BoardPageClient';
import CategoryPageClient, { type CategoryData } from './CategoryPageClient';
import { isBoardIndexable } from '@/lib/board-seo';

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

interface CategoryResponse {
  data: CategoryData;
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  // 先當看板查；查不到再當分類查（baseball/basketball/soccer 這類是分類聚合頁）
  try {
    const res = await apiFetch<BoardResponse>(`/boards/${params.slug}`);
    const indexable = isBoardIndexable(res.data.slug);
    return {
      title: `${res.data.name}`,
      description: res.data.description ?? `${res.data.name} 討論看板`,
      alternates: { canonical: `/board/${params.slug}` },
      // 尚未補上賽事數據的薄內容板塊先不收錄，避免拖累整站品質（見 board-seo.ts）
      ...(indexable ? {} : { robots: { index: false, follow: true } }),
    };
  } catch {
    // 看板查不到 → 試分類
  }
  try {
    const res = await apiFetch<CategoryResponse>(`/boards/categories/${params.slug}`);
    return {
      title: `${res.data.name}最新新聞與討論`,
      description: `彙整 ${res.data.boards.map((b) => b.name).join('、')} 的最新新聞、賽事討論與玩家熱議。`,
      alternates: { canonical: `/board/${params.slug}` },
    };
  } catch {
    return { title: '頁面不存在' };
  }
}

export default async function BoardPage({ params }: { params: { slug: string } }) {
  // 看板優先；不是看板再試分類聚合頁；都不是才 404
  try {
    const res = await apiFetch<BoardResponse>(`/boards/${params.slug}`);
    // SSR 撈第一頁討論串當 React Query 種子：讓爬蟲在 server 端 HTML 就看到 /post 內鏈（discovery），
    // 參數需與 BoardPageClient 初始 query 一致（page1 / limit20 / sort=lastReply）。撈失敗則交給 client 重試。
    let initialPosts: BoardPostsResponse | undefined;
    try {
      initialPosts = await apiFetch<BoardPostsResponse>(
        `/boards/${params.slug}/posts?page=1&limit=20&sort=lastReply`,
        // 明確設 60s 重新驗證：避免 Next Data Cache 把 SSR 種子（爬蟲看到的第一頁內鏈）長期定格成舊資料
        { next: { revalidate: 60 } },
      );
    } catch {
      // 貼文 API 暫時失敗 → initialPosts 留 undefined，client 端 useQuery 會自行取得
    }
    return <BoardPageClient board={res.data} initialPosts={initialPosts} />;
  } catch {
    // 看板查不到 → 往下試分類
  }
  try {
    const res = await apiFetch<CategoryResponse>(`/boards/categories/${params.slug}`);
    return <CategoryPageClient category={res.data} />;
  } catch {
    notFound();
  }
}
