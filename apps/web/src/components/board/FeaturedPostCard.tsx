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
 * 無封面圖時的 fallback：用「聯盟主題色塊 + 字標」取代千篇一律的單一圖示（C 案）。
 * 商標安全：自製漸層 + 字標 + 棒球線條底紋，不使用任何官方 logo。
 * 棒球依「聯盟」細分上色（MLB / 中職 / 日職 / 韓職），不再全部歸成同一個「棒球」色塊，
 * 讓並排的無圖卡片一眼分得出聯盟，而不是複製貼上。
 *  - league 由呼叫端傳入看板 slug（最準）；沒傳則退而用 tags + 標題關鍵字判斷。
 */
type FallbackTheme = { label: string; gradient: string };

const LEAGUE_FALLBACK: Record<string, FallbackTheme> = {
  mlb: { label: 'MLB', gradient: 'linear-gradient(135deg,#1e3a8a,#2563eb)' },
  cpbl: { label: 'CPBL', gradient: 'linear-gradient(135deg,#991b1b,#dc2626)' },
  npb: { label: 'NPB', gradient: 'linear-gradient(135deg,#9f1239,#e11d48)' },
  kbo: { label: 'KBO', gradient: 'linear-gradient(135deg,#3730a3,#4f46e5)' },
};
const FOOTBALL_FALLBACK: FallbackTheme = { label: '足球', gradient: 'linear-gradient(135deg,#065f46,#10b981)' };
const BASKETBALL_FALLBACK: FallbackTheme = { label: '籃球', gradient: 'linear-gradient(135deg,#b45309,#f59e0b)' };
const BASEBALL_FALLBACK: FallbackTheme = { label: '棒球', gradient: 'linear-gradient(135deg,#0d9488,#0f766e)' };
const NEWS_FALLBACK: FallbackTheme = { label: '新聞', gradient: 'linear-gradient(135deg,#1d4ed8,#3b82f6)' };
const ANNOUNCEMENT_FALLBACK: FallbackTheme = { label: '公告', gradient: 'linear-gradient(135deg,#c2410c,#f97316)' };

function resolveFallback(
  variant: FeaturedVariant,
  post: FeaturedPostItem,
  league?: string,
): FallbackTheme {
  if (variant === 'announcement') return ANNOUNCEMENT_FALLBACK;
  // 1) 呼叫端明確指定聯盟（看板 slug）→ 最準
  if (league && LEAGUE_FALLBACK[league]) return LEAGUE_FALLBACK[league];
  // 2) 從 tags + 標題關鍵字判斷（先細分棒球聯盟，再退到運動別）
  const text = post.tags.map((t) => t.tag.name).join(' ') + ' ' + post.title;
  if (/中職|中華職棒|味全|樂天桃猿|統一獅|富邦悍將|台鋼雄鷹/.test(text)) return LEAGUE_FALLBACK.cpbl;
  if (/日職|日本職棒|NPB|軟銀|讀賣|阪神|歐力士/i.test(text)) return LEAGUE_FALLBACK.npb;
  if (/韓職|KBO|韓國職棒/i.test(text)) return LEAGUE_FALLBACK.kbo;
  if (/MLB|大聯盟|大谷|道奇|洋基|世界大賽|world series/i.test(text)) return LEAGUE_FALLBACK.mlb;
  if (/足球|世足|世界盃|足壇|歐國盃|英超|西甲|歐冠/.test(text)) return FOOTBALL_FALLBACK;
  if (/籃球|NBA|季後賽/i.test(text)) return BASKETBALL_FALLBACK;
  if (/棒球|職棒/i.test(text)) return BASEBALL_FALLBACK;
  return NEWS_FALLBACK;
}

export function FeaturedPostCard({
  post,
  variant = 'news',
  league,
}: {
  post: FeaturedPostItem;
  variant?: FeaturedVariant;
  /** 所屬聯盟看板 slug（mlb/cpbl/npb/kbo…），決定無圖 fallback 的聯盟色塊；不傳則用關鍵字判斷 */
  league?: string;
}) {
  const cover = extractFirstImage(post.content);
  const summary = extractSummary(post.content);
  const style = VARIANT_STYLE[variant];
  const fallback = resolveFallback(variant, post, league);

  return (
    <Link
      href={`/post/${post.id}`}
      className={`group relative flex gap-3 bg-slate-50 hover:bg-white transition-all rounded-lg overflow-hidden border border-slate-200 border-l-[3px] ${style.border} p-3 shadow-sm hover:shadow-md`}
    >
      {/* 縮圖：有圖放圖；無圖用聯盟主題色塊（C 案：漸層 + 字標 + 棒球底紋，依聯盟區分） */}
      <div className="w-14 h-14 shrink-0 rounded-md overflow-hidden flex items-center justify-center">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className="relative w-full h-full flex items-center justify-center overflow-hidden text-white"
            style={{ background: fallback.gradient }}
            aria-hidden
          >
            <svg
              className="absolute inset-0 w-full h-full opacity-10"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <circle cx="80" cy="20" r="22" fill="none" stroke="white" strokeWidth="3" />
              <path d="M-5 72 Q45 52 105 82" stroke="white" strokeWidth="3" fill="none" />
            </svg>
            <span className="relative text-[11px] font-black tracking-tight">
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
