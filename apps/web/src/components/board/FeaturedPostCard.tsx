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

/**
 * 卡片身分 = 顏色。新聞走品牌主色青綠、站方公告走強調橘。
 * 左直條與 hover 標題色都跟著 variant 走，讓使用者掃一眼就分得出兩區。
 */
type FeaturedVariant = 'news' | 'announcement';

const VARIANT_STYLE: Record<
  FeaturedVariant,
  { border: string; hoverTitle: string }
> = {
  news: { border: 'border-l-blue-500', hoverTitle: 'group-hover:text-blue-600' },
  announcement: {
    border: 'border-l-orange-500',
    hoverTitle: 'group-hover:text-orange-600',
  },
};

/**
 * 無封面圖時的 fallback：用「分類色塊 + 短標籤」取代千篇一律的單一 emoji。
 * 新聞依運動分類上色（足球/NBA/棒球…），公告統一走橘色「公告」。
 * 這樣三張無圖卡片並排時是「同系列的分類色」而不是「複製貼上」。
 */
function resolveFallback(
  variant: FeaturedVariant,
  post: FeaturedPostItem,
): { label: string; wrap: string; text: string } {
  if (variant === 'announcement') {
    return { label: '公告', wrap: 'bg-orange-50', text: 'text-orange-600' };
  }
  const text = post.tags.map((t) => t.tag.name).join(' ') + ' ' + post.title;
  if (/足球|世足|世界盃|足壇|歐國盃|英超|西甲|歐冠/.test(text)) {
    return { label: '足球', wrap: 'bg-emerald-50', text: 'text-emerald-700' };
  }
  if (/籃球|NBA|季後賽/i.test(text)) {
    return { label: 'NBA', wrap: 'bg-amber-50', text: 'text-amber-700' };
  }
  if (/棒球|MLB|職棒|大聯盟|中職|世界大賽/i.test(text)) {
    return { label: '棒球', wrap: 'bg-sky-50', text: 'text-sky-700' };
  }
  return { label: '新聞', wrap: 'bg-blue-50', text: 'text-blue-600' };
}

export function FeaturedPostCard({
  post,
  variant = 'news',
}: {
  post: FeaturedPostItem;
  variant?: FeaturedVariant;
}) {
  const cover = extractFirstImage(post.content);
  const summary = extractSummary(post.content);
  const style = VARIANT_STYLE[variant];
  const fallback = resolveFallback(variant, post);

  return (
    <Link
      href={`/post/${post.id}`}
      className={`group relative flex gap-3 bg-slate-50 hover:bg-white transition-all rounded-lg overflow-hidden border border-slate-200 border-l-[3px] ${style.border} p-3 shadow-sm hover:shadow-md`}
    >
      {/* 縮圖：有圖放圖；無圖用分類色塊 + 短標籤（避免三張同一顆 emoji） */}
      <div className="w-14 h-14 shrink-0 rounded-md overflow-hidden flex items-center justify-center">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className={`w-full h-full flex items-center justify-center ${fallback.wrap}`}
            aria-hidden
          >
            <span className={`text-xs font-bold tracking-tight ${fallback.text}`}>
              {fallback.label}
            </span>
          </div>
        )}
      </div>

      {/* 文字區 */}
      <div className="flex-1 min-w-0">
        <h3
          className={`text-sm font-semibold leading-snug line-clamp-2 text-slate-900 ${style.hoverTitle} transition-colors`}
        >
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
