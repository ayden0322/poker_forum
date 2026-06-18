'use client';

import Link from 'next/link';

export interface PostItem {
  id: string;
  title: string;
  content?: string;
  isPinned: boolean;
  isLocked: boolean;
  section?: 'NEWS' | 'FEATURED' | 'DISCUSSION';
  viewCount: number;
  replyCount: number;
  pushCount: number;
  lastReplyAt: string | null;
  createdAt: string;
  author: {
    id: string;
    nickname: string;
    avatar: string | null;
    level: number;
    role: string;
  };
  tags: { tag: { id: string; name: string; slug: string } }[];
  _count: { replies: number; pushes: number };
  /** 聚合頁（分類層級）才有：該文所屬看板，用來標聯盟 badge */
  board?: { slug: string; name: string };
}

/** 「剛回」標籤判定門檻：lastReplyAt 在此分鐘數內視為剛有人回覆 */
const FRESH_REPLY_THRESHOLD_MIN = 6 * 60; // 6 小時

/**
 * 判定文章是否為「剛回」：
 * - 必須真的有人回過（lastReplyAt 嚴格晚於 createdAt 至少 1 分鐘，排除「發文同時間」誤判）
 * - lastReplyAt 距現在不超過 FRESH_REPLY_THRESHOLD_MIN
 */
function isFreshReply(post: PostItem): boolean {
  if (!post.lastReplyAt) return false;
  const replyTs = new Date(post.lastReplyAt).getTime();
  const createdTs = new Date(post.createdAt).getTime();
  if (replyTs - createdTs < 60_000) return false; // 沒人回的新文（lastReplyAt = createdAt）
  const minSinceReply = (Date.now() - replyTs) / 60_000;
  return minSinceReply >= 0 && minSinceReply < FRESH_REPLY_THRESHOLD_MIN;
}

/** 相對時間格式化：剛剛 / N 分鐘前 / N 小時前 / N 天前 / 日期 */
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '剛剛';
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(iso).toLocaleDateString('zh-TW');
}

/** 數字縮寫：1234 → 1.2k */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.floor(n / 1000)}k`;
}

/** 聚合頁用：看板 slug → 聯盟 badge 文字/配色（沿用站上既有聯盟配色） */
const BOARD_BADGE: Record<string, { label: string; cls: string }> = {
  mlb: { label: 'MLB', cls: 'bg-blue-50 text-blue-700' },
  cpbl: { label: '中職', cls: 'bg-red-50 text-red-600' },
  npb: { label: '日職', cls: 'bg-rose-50 text-rose-600' },
  kbo: { label: '韓職', cls: 'bg-indigo-50 text-indigo-600' },
  'other-baseball': { label: '其他棒球', cls: 'bg-gray-100 text-gray-500' },
};

export function boardBadgeFor(board?: { slug: string; name: string }) {
  if (!board) return null;
  return BOARD_BADGE[board.slug] ?? { label: board.name, cls: 'bg-gray-100 text-gray-500' };
}

/**
 * 討論列（看板頁與分類聚合頁共用）。
 * showBoardBadge=true 時，若該文帶 board 資訊會在標籤列前標出所屬聯盟（分類聚合頁用）。
 */
export function PostRow({ post, showBoardBadge = false }: { post: PostItem; showBoardBadge?: boolean }) {
  const isHot = post.pushCount >= 10 || post._count.replies >= 20;
  const fresh = isFreshReply(post);
  const boardBadge = showBoardBadge ? boardBadgeFor(post.board) : null;
  const roleBadge =
    post.author.role === 'ADMIN' || post.author.role === 'SUPER_ADMIN'
      ? { label: '管理員', cls: 'bg-red-100 text-red-600' }
      : post.author.role === 'MODERATOR'
      ? { label: '編輯', cls: 'bg-purple-100 text-purple-600' }
      : null;

  // 左側色條優先級：置頂(紅) > 熱門(橘) > 剛回(藍)
  const leftBorderCls = post.isPinned
    ? 'border-l-4 border-l-red-400'
    : isHot
    ? 'border-l-4 border-l-orange-400'
    : fresh
    ? 'border-l-4 border-l-blue-400'
    : '';

  return (
    <Link
      href={`/post/${post.id}`}
      className={`group relative block bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 ${leftBorderCls}`}
    >
      <div className="flex items-start gap-3">
        {/* 作者頭像 */}
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-600 text-base font-semibold shrink-0 overflow-hidden ring-2 ring-white shadow-sm">
          {post.author.avatar ? (
            <img src={post.author.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            post.author.nickname.charAt(0)
          )}
        </div>

        {/* 主要內容 */}
        <div className="flex-1 min-w-0">
          {/* 標籤列 */}
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            {boardBadge && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${boardBadge.cls}`}>
                {boardBadge.label}
              </span>
            )}
            {post.isPinned && (
              <span className="text-[11px] bg-red-500 text-white px-2 py-0.5 rounded-full font-medium">
                📌 置頂
              </span>
            )}
            {isHot && !post.isPinned && (
              <span className="text-[11px] bg-gradient-to-r from-orange-400 to-red-500 text-white px-2 py-0.5 rounded-full font-medium">
                🔥 熱門
              </span>
            )}
            {/* 「剛回」：6 小時內有人回覆。置頂優先，不重複顯示；可與熱門共存 */}
            {fresh && !post.isPinned && (
              <span className="text-[11px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-medium">
                💬 剛回
              </span>
            )}
            {post.isLocked && (
              <span className="text-[11px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                🔒 鎖定
              </span>
            )}
            {post.tags.slice(0, 3).map((t) => (
              <span
                key={t.tag.id}
                className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full"
              >
                #{t.tag.name}
              </span>
            ))}
          </div>

          {/* 標題 */}
          <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug mb-1.5">
            {post.title}
          </h3>

          {/* 底部資訊列 */}
          <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
            <span className="font-medium text-gray-700">{post.author.nickname}</span>
            {roleBadge && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${roleBadge.cls}`}>
                {roleBadge.label}
              </span>
            )}
            <span className="text-gray-300">·</span>
            <span>發表於 {formatRelativeTime(post.createdAt)}</span>
            {post.lastReplyAt && post.lastReplyAt !== post.createdAt && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-blue-600">
                  最後回覆 {formatRelativeTime(post.lastReplyAt)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* 右側統計 */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {/* 回覆數 pill（主要） */}
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
              post._count.replies > 0
                ? 'bg-blue-50 text-blue-600'
                : 'bg-gray-50 text-gray-400'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span>{formatCount(post._count.replies)}</span>
          </div>
          {/* 瀏覽 / 推文（次要） */}
          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            <span className="flex items-center gap-0.5">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {formatCount(post.viewCount)}
            </span>
            {post.pushCount > 0 && (
              <span className="flex items-center gap-0.5 text-orange-500">
                ▲ {formatCount(post.pushCount)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
