'use client';

/**
 * 今日賽事討論串置頂區
 *
 * 識別規則（第一階段，無 schema 變更）：
 *   - 文章標題開頭含「[Match Thread]」或「【Match Thread】」
 *   - 或 isPinned 且帶 'match-thread' tag slug
 *
 * 用於：/board/world-cup 看板頁，活動條下方、tag 篩選列上方
 *
 * 注意：實際後端文章資料才會有 isPinned/tags，這個元件接受 props 由父層傳入
 */

import Link from 'next/link';

interface PostItem {
  id: string;
  title: string;
  isPinned: boolean;
  replyCount: number;
  pushCount: number;
  lastReplyAt: string | null;
  createdAt: string;
  author: { nickname: string };
  tags: { tag: { name: string; slug: string } }[];
}

function isMatchThread(p: PostItem): boolean {
  if (/^[\[【]\s*Match\s*Thread/i.test(p.title)) return true;
  if (p.isPinned && p.tags.some((t) => t.tag.slug === 'match-thread')) return true;
  return false;
}

function relTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '剛剛';
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  return `${Math.floor(hr / 24)} 天前`;
}

export function WorldCupMatchThreadShelf({ posts }: { posts: PostItem[] }) {
  const matchThreads = posts.filter(isMatchThread);
  if (matchThreads.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border-2 border-blue-300 bg-blue-50/50 overflow-hidden">
      <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>⚽</span>
          <span className="font-bold text-sm">今日賽事討論串</span>
          <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">
            {matchThreads.length} 場
          </span>
        </div>
        <span className="text-[10px] text-blue-100 hidden sm:inline">即時更新中</span>
      </div>
      <div className="divide-y divide-blue-100">
        {matchThreads.map((p) => (
          <Link
            key={p.id}
            href={`/post/${p.id}`}
            className="group block px-3 py-2.5 hover:bg-white transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-600">
                  {p.title}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                  <span>{p.author.nickname}</span>
                  <span className="text-gray-300">·</span>
                  <span>💬 {p.replyCount} 回覆</span>
                  {p.pushCount > 0 && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="text-orange-500">▲ {p.pushCount}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-gray-500 mb-0.5">最新</div>
                <div className="text-xs font-medium text-blue-600">
                  {relTime(p.lastReplyAt ?? p.createdAt)}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
