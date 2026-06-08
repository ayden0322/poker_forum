import { MetadataRoute } from 'next';
import { apiFetch } from '@/lib/api';
import { SITE_URL } from '@/lib/site';

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
      cat.boards.map((board) => ({
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
