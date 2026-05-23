'use client';

import Link from 'next/link';

/** 行動裝置上「站方推送」預設顯示的篇數，多的需要點「展開全部」 */
export const FEATURED_MOBILE_PREVIEW = 2;

interface FeaturedPostItem {
  id: string;
  title: string;
  content?: string;
  createdAt: string;
  author: {
    id: string;
    nickname: string;
    avatar: string | null;
    role: string;
  };
  tags: { tag: { id: string; name: string; slug: string } }[];
  _count: { replies: number; pushes: number };
}

/** 從 HTML 內容抽第一張圖；找不到回 null */
function extractFirstImage(html?: string): string | null {
  if (!html) return null;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1] ?? null;
}

/** 從 HTML 抽純文字摘要，限制長度 */
function extractSummary(html?: string, max = 80): string {
  if (!html) return '';
  // 移除標籤、HTML entity、多餘空白
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

/** 相對時間格式化 */
function formatRelativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return '剛剛';
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(iso).toLocaleDateString('zh-TW');
}

export function FeaturedPostCard({ post }: { post: FeaturedPostItem }) {
  const cover = extractFirstImage(post.content);
  const summary = extractSummary(post.content);

  return (
    <Link
      href={`/post/${post.id}`}
      className="group relative flex gap-3 bg-slate-50 hover:bg-white transition-all rounded-lg overflow-hidden border border-slate-200 border-l-[3px] border-l-orange-500 p-3 shadow-sm hover:shadow-md"
    >
      {/* 縮圖：有圖就放圖，沒圖放中性灰底 + 橘色推送 icon */}
      <div className="w-16 h-16 shrink-0 rounded-md overflow-hidden bg-slate-100 flex items-center justify-center">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl text-orange-500" aria-hidden>📣</span>
        )}
      </div>

      {/* 文字區 */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold leading-snug line-clamp-2 text-slate-900 group-hover:text-orange-600 transition-colors">
          {post.title}
        </h3>
        {summary && (
          <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
            {summary}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500">
          <span>{post.author.nickname}</span>
          <span className="text-slate-300">·</span>
          <span>{formatRelativeTime(post.createdAt)}</span>
          {post._count.replies > 0 && (
            <>
              <span className="text-slate-300">·</span>
              <span>💬 {post._count.replies}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
