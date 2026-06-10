import { MetadataRoute } from 'next';
import { apiFetch } from '@/lib/api';
import { SITE_URL } from '@/lib/site';
import { isBoardIndexable } from '@/lib/board-seo';

interface Category {
  boards: { slug: string }[];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL;

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/search`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
    { url: `${baseUrl}/register`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ];

  try {
    const res = await apiFetch<{ data: Category[] }>('/boards/categories');
    const boardPages = res.data.flatMap((cat) =>
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
    return [...staticPages, ...boardPages];
  } catch {
    return staticPages;
  }
}
