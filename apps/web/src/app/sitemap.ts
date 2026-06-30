import { MetadataRoute } from 'next';
import { apiFetch } from '@/lib/api';
import { SITE_URL } from '@/lib/site';
import { isBoardIndexable } from '@/lib/board-seo';

interface Category {
  slug: string;
  boards: { slug: string }[];
}

interface SitemapPost {
  id: string;
  updatedAt: string;
  board: { slug: string };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL;

  // /register、/search 等工具/薄頁不放 sitemap（register 為 'use client' 無法加 noindex，故直接不收）。
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
  ];

  // 板塊頁與貼文頁各自獨立取得：任一支 API 掛掉時，另一支仍要進 sitemap，不能一起 fallback 成只剩靜態頁。
  let boardPages: MetadataRoute.Sitemap = [];
  try {
    const res = await apiFetch<{ data: Category[] }>('/boards/categories');
    // 分類聚合頁（/board/baseball 等）：有真內容、可索引，但只靠內鏈會被發現得慢，補進 sitemap。
    const categoryPages = res.data.map((cat) => ({
      url: `${baseUrl}/board/${cat.slug}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }));
    const boardLeafPages = res.data.flatMap((cat) =>
      cat.boards
        // 薄內容板塊（尚未補賽事數據）一併排除，與 page.tsx 的 noindex 保持一致信號
        .filter((board) => isBoardIndexable(board.slug))
        .map((board) => ({
          url: `${baseUrl}/board/${board.slug}`,
          lastModified: new Date(),
          changeFrequency: 'daily' as const,
          priority: 0.8,
        })),
    );
    boardPages = [...categoryPages, ...boardLeafPages];
  } catch {
    // 板塊 API 掛掉 → 板塊頁略過，仍輸出貼文與靜態頁
  }

  // 貼文頁（論壇命脈內容）：用真實 updatedAt 當 lastmod（避免每次 build 全部標「剛更新」灌水），
  // 並沿用 isBoardIndexable 過濾薄板塊下的貼文，與 board / page 的 noindex 信號一致。
  let postPages: MetadataRoute.Sitemap = [];
  try {
    const res = await apiFetch<{ data: SitemapPost[] }>('/posts/sitemap');
    postPages = res.data
      .filter((post) => isBoardIndexable(post.board.slug))
      .map((post) => ({
        url: `${baseUrl}/post/${post.id}`,
        lastModified: new Date(post.updatedAt),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }));
  } catch {
    // 貼文 API 掛掉 → 貼文頁略過
  }

  return [...staticPages, ...boardPages, ...postPages];
}
