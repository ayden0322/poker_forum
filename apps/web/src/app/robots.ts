import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /search = 薄/重複內容陷阱；member-center/notifications/bookmarks = 登入後私密空殼頁。
        // 註：/user/* 不在此列——改用頁面層 meta noindex+follow（robots 擋掉會讓爬蟲讀不到 noindex 也跟不了連結）。
        disallow: ['/settings', '/auth/', '/r/', '/search', '/member-center', '/notifications', '/bookmarks', '/ayden'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
