import { apiFetch } from '@/lib/api';
import { notFound } from 'next/navigation';
import PostDetailClient from './PostDetailClient';
import { SITE_URL } from '@/lib/site';
import { serializeJsonLd } from '@/lib/json-ld';

/** 去除 HTML 標籤並壓縮空白，供 meta description / JSON-LD 使用（避免 SERP 摘要出現 <p> 跳脫標籤）。 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

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
    // 與頁面 fetch 用相同 options，讓 Next 在同一 request 內 memoize 成單次（避免 viewCount 雙增）
    const res = await apiFetch<{ data: PostData }>(`/posts/${params.id}`, { cache: 'no-store' });
    const title = `${res.data.title} - ${res.data.board.name}`;
    const description = stripHtml(res.data.content).substring(0, 150);
    return {
      // 品牌後綴交給 layout 的 title.template（'%s | 博客邦'）統一補，避免出現「… - 博客邦 | 博客邦」雙品牌
      title,
      description,
      alternates: { canonical: `/post/${params.id}` },
      // 逐篇 OG，避免分享到 LINE/FB 時所有貼文長一樣（沿用頁面 title/description）
      openGraph: {
        title,
        description,
        type: 'article',
        url: `/post/${params.id}`,
      },
    };
  } catch {
    return { title: '文章不存在' };
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

  // 論壇貼文結構化資料：讓 Google 識別為討論串（DiscussionForumPosting rich result）。
  // 在 server component 直接吐出，確保爬蟲不需跑 JS 就拿得到。
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: post.title,
    url: `${SITE_URL}/post/${post.id}`,
    datePublished: post.createdAt,
    dateModified: post.updatedAt,
    author: { '@type': 'Person', name: post.author.nickname },
    articleSection: post.board.name,
    text: stripHtml(post.content).substring(0, 5000),
    interactionStatistic: [
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/CommentAction',
        userInteractionCount: post._count.replies,
      },
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/LikeAction',
        // 用畫面顯示的 pushCount（推文鈕同源），避免 structured data 與可見數字不一致
        userInteractionCount: post.pushCount,
      },
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/ViewAction',
        userInteractionCount: post.viewCount,
      },
    ],
  };

  // 麵包屑結構化資料，對應頁面可見麵包屑（首頁 › 看板 › 本文），強化階層理解與 SERP 路徑顯示。
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首頁', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: post.board.name, item: `${SITE_URL}/board/${post.board.slug}` },
      { '@type': 'ListItem', position: 3, name: post.title },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd([jsonLd, breadcrumbJsonLd]) }}
      />
      <PostDetailClient post={post} />
    </>
  );
}
