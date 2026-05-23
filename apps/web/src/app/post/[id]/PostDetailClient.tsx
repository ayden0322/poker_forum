'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth';
import { apiFetch } from '@/lib/api';
import { ReportModal } from '@/components/post/ReportModal';
import RichTextContent from '@/components/editor/RichTextContent';

const RichTextEditor = dynamic(() => import('@/components/editor/RichTextEditor'), { ssr: false });

interface PostData {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  isLocked: boolean;
  isAnnounce: boolean;
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

interface ReplyItem {
  id: string;
  floorNumber: number;
  content: string;
  pushCount: number;
  createdAt: string;
  author: { id: string; nickname: string; avatar: string | null; level: number; role: string };
  quotedReply: { id: string; floorNumber: number; content: string; author: { nickname: string } } | null;
  _count: { pushes: number };
}

interface RepliesResponse {
  data: { items: ReplyItem[]; total: number; page: number; limit: number };
}

const LEVEL_LABELS = ['', '新手', '初階', '中階', '資深', '達人', '大師'];
const ROLE_BADGES: Record<string, { label: string; color: string }> = {
  ADMIN: { label: '管理員', color: 'bg-red-100 text-red-600' },
  MODERATOR: { label: '版主', color: 'bg-blue-100 text-blue-600' },
};

export default function PostDetailClient({ post }: { post: PostData }) {
  const { user, accessToken: token, requireLogin, requirePhoneVerified } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [replyContent, setReplyContent] = useState('');
  const [quotedReplyId, setQuotedReplyId] = useState<string | null>(null);
  const [replyPage, setReplyPage] = useState(1);

  // 書籤狀態
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  // 推文狀態
  const [hasPushed, setHasPushed] = useState(false);

  // 檢舉 Modal
  const [showReport, setShowReport] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ postId?: string; replyId?: string }>({});

  // 分享提示
  const [showCopied, setShowCopied] = useState(false);

  // 刪除確認
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isAuthor = user?.id === post.author.id;
  const isAdminOrMod = user?.role === 'ADMIN' || user?.role === 'MODERATOR';

  // 查詢書籤狀態
  useEffect(() => {
    if (!token) return;
    apiFetch<{ data: { bookmarked: boolean } }>(`/bookmarks/${post.id}`, { token: token ?? undefined })
      .then((res) => setIsBookmarked(res.data.bookmarked))
      .catch(() => {});
  }, [token, post.id]);

  // 查詢推文狀態
  useEffect(() => {
    if (!token) return;
    apiFetch<{ data: { pushed: boolean } }>(`/posts/${post.id}/push`, { token: token ?? undefined })
      .then((res) => setHasPushed(res.data.pushed))
      .catch(() => {});
  }, [token, post.id]);

  const { data: repliesData, isLoading: repliesLoading } = useQuery({
    queryKey: ['replies', post.id, replyPage],
    queryFn: () =>
      apiFetch<RepliesResponse>(`/posts/${post.id}/replies?page=${replyPage}&limit=20`),
  });

  const replies = repliesData?.data.items ?? [];
  const totalReplies = repliesData?.data.total ?? 0;
  const totalReplyPages = Math.ceil(totalReplies / 20);

  const pushMutation = useMutation({
    mutationFn: () => {
      if (hasPushed) {
        return apiFetch(`/posts/${post.id}/push`, { method: 'DELETE' });
      }
      return apiFetch(`/posts/${post.id}/push`, { method: 'POST' });
    },
    onSuccess: () => {
      setHasPushed(!hasPushed);
      queryClient.invalidateQueries({ queryKey: ['post', post.id] });
    },
  });

  const replyMutation = useMutation({
    mutationFn: (body: { content: string; quotedReplyId?: string }) =>
      apiFetch(`/posts/${post.id}/replies`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setReplyContent('');
      setQuotedReplyId(null);
      queryClient.invalidateQueries({ queryKey: ['replies', post.id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/posts/${post.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      router.push(`/board/${post.board.slug}`);
    },
  });

  const isReplyEmpty = !replyContent || replyContent === '<p></p>' || replyContent.replace(/<[^>]*>/g, '').trim() === '';

  const handleReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReplyEmpty) return;
    if (!requireLogin()) return;
    if (!requirePhoneVerified()) return;
    replyMutation.mutate({
      content: replyContent,
      ...(quotedReplyId ? { quotedReplyId } : {}),
    });
  };

  const toggleBookmark = useCallback(async () => {
    if (!requireLogin()) return;
    if (bookmarkLoading) return;
    if (isBookmarked && !confirm('確定要取消收藏嗎？')) return;
    setBookmarkLoading(true);
    try {
      if (isBookmarked) {
        await apiFetch(`/bookmarks/${post.id}`, { method: 'DELETE' });
        setIsBookmarked(false);
      } else {
        await apiFetch(`/bookmarks/${post.id}`, { method: 'POST' });
        setIsBookmarked(true);
      }
    } catch {
      // 忽略
    } finally {
      setBookmarkLoading(false);
    }
  }, [token, bookmarkLoading, isBookmarked, post.id]);

  const handleShare = () => {
    const url = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    });
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const formatDate = (d: string) => {
    if (!mounted) return '';
    const date = new Date(d);
    return `${date.toLocaleDateString('zh-TW')} ${date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* 麵包屑 */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        <Link href="/" className="hover:text-blue-600">首頁</Link>
        <span>/</span>
        <span>{post.board.category.name}</span>
        <span>/</span>
        <Link href={`/board/${post.board.slug}`} className="hover:text-blue-600">{post.board.name}</Link>
        <span>/</span>
        <span className="text-gray-900 truncate max-w-[200px]" title={post.title}>{post.title}</span>
      </nav>

      {/* 文章主體 */}
      <article className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
        {/* 標題列 */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {post.isPinned && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded font-medium">置頂</span>
            )}
            {post.isAnnounce && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-medium">公告</span>
            )}
            {post.isLocked && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">鎖定</span>
            )}
            <h1 className="text-xl font-bold">{post.title}</h1>
          </div>
          {post.tags.length > 0 && (
            <div className="flex gap-2">
              {post.tags.map((t) => (
                <span key={t.tag.id} className="text-xs text-blue-500">#{t.tag.name}</span>
              ))}
            </div>
          )}
        </div>

        {/* 作者 + 內容 */}
        <div className="flex">
          {/* 作者側欄 */}
          <div className="w-[140px] shrink-0 bg-gray-50 p-4 text-center border-r border-gray-100 hidden md:block">
            <div className="w-14 h-14 rounded-full bg-gray-200 mx-auto mb-2 flex items-center justify-center text-gray-500 overflow-hidden">
              {post.author.avatar ? (
                <img src={post.author.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg">{post.author.nickname.charAt(0)}</span>
              )}
            </div>
            <Link href={`/user/${post.author.nickname}`} className="font-medium text-sm hover:text-blue-600 block">
              {post.author.nickname}
            </Link>
            {ROLE_BADGES[post.author.role] && (
              <span className={`text-xs px-1.5 py-0.5 rounded mt-1 inline-block ${ROLE_BADGES[post.author.role].color}`}>
                {ROLE_BADGES[post.author.role].label}
              </span>
            )}
            <div className="text-xs text-gray-400 mt-1">
              Lv.{post.author.level} {LEVEL_LABELS[post.author.level]}
            </div>
          </div>

          {/* 內容 */}
          <div className="flex-1 p-5">
            {/* 手機版作者 */}
            <div className="flex items-center gap-2 mb-3 md:hidden">
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm overflow-hidden">
                {post.author.avatar ? (
                  <img src={post.author.avatar} alt="" className="w-full h-full object-cover" />
                ) : post.author.nickname.charAt(0)}
              </div>
              <Link href={`/user/${post.author.nickname}`} className="font-medium text-sm hover:text-blue-600">
                {post.author.nickname}
              </Link>
              <span className="text-xs text-gray-400">Lv.{post.author.level}</span>
            </div>

            <div className="text-gray-800 min-h-[100px]">
              <RichTextContent content={post.content} />
            </div>

            {/* 底部操作列 */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100 text-sm text-gray-400">
              <span>{formatDate(post.createdAt)}</span>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <span className="hidden sm:inline">瀏覽 {post.viewCount}</span>
                <span className="hidden sm:inline">回覆 {post._count.replies}</span>

                {/* 推文按鈕 */}
                <button
                  onClick={() => {
                    if (!requireLogin()) return;
                    pushMutation.mutate();
                  }}
                  disabled={pushMutation.isPending}
                  className={`flex items-center gap-1 px-3 py-1 rounded-full transition-colors ${
                    hasPushed
                      ? 'bg-blue-100 text-blue-600'
                      : 'hover:bg-blue-50 hover:text-blue-600 cursor-pointer'
                  }`}
                  title={hasPushed ? '取消推文' : '推文'}
                >
                  <svg className="w-4 h-4" fill={hasPushed ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                  </svg>
                  <span className="font-medium">{post.pushCount}</span>
                </button>

                {/* 書籤按鈕 — 未登入也看得到，點擊時引導登入 */}
                <button
                  onClick={toggleBookmark}
                  disabled={bookmarkLoading}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full transition-colors ${
                    isBookmarked ? 'text-yellow-500' : 'hover:text-yellow-500'
                  }`}
                  title={isBookmarked ? '取消收藏' : '收藏'}
                >
                  <svg className="w-4 h-4" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>

                {/* 分享按鈕 */}
                <div className="relative">
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-1 px-2 py-1 rounded-full transition-colors hover:text-blue-600"
                    title="複製連結"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  </button>
                  {showCopied && (
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap">
                      已複製連結
                    </span>
                  )}
                </div>

                {/* 檢舉按鈕 */}
                {token && !isAuthor && (
                  <button
                    onClick={() => { setReportTarget({ postId: post.id }); setShowReport(true); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-full transition-colors hover:text-red-500"
                    title="檢舉"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                    </svg>
                  </button>
                )}

                {/* 作者 / 管理員操作 */}
                {(isAuthor || isAdminOrMod) && (
                  <>
                    <Link
                      href={`/post/${post.id}/edit`}
                      className="flex items-center gap-1 px-2 py-1 rounded-full transition-colors hover:text-green-600"
                      title="編輯"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </Link>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-1 px-2 py-1 rounded-full transition-colors hover:text-red-600"
                      title="刪除"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </article>

      {/* 回覆列表 */}
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-4">回覆 ({totalReplies})</h2>

        {repliesLoading ? (
          <div className="text-center py-10 text-gray-400">載入中...</div>
        ) : replies.length === 0 ? (
          <div className="text-center py-10 text-gray-400">尚無回覆，來搶頭香吧！</div>
        ) : (
          <div className="space-y-3">
            {replies.map((reply) => (
              <div key={reply.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex">
                  {/* 作者側欄 */}
                  <div className="w-[100px] shrink-0 bg-gray-50 p-3 text-center border-r border-gray-100 hidden md:block">
                    <div className="w-10 h-10 rounded-full bg-gray-200 mx-auto mb-1 flex items-center justify-center text-sm overflow-hidden">
                      {reply.author.avatar ? (
                        <img src={reply.author.avatar} alt="" className="w-full h-full object-cover" />
                      ) : reply.author.nickname.charAt(0)}
                    </div>
                    <Link href={`/user/${reply.author.nickname}`} className="text-xs font-medium hover:text-blue-600 block truncate">
                      {reply.author.nickname}
                    </Link>
                    <div className="text-xs text-gray-400">Lv.{reply.author.level}</div>
                  </div>

                  {/* 回覆內容 */}
                  <div className="flex-1 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500">B{reply.floorNumber}</span>
                        {/* 手機版作者 */}
                        <Link href={`/user/${reply.author.nickname}`} className="text-xs font-medium hover:text-blue-600 md:hidden">
                          {reply.author.nickname}
                        </Link>
                        <span className="text-xs text-gray-400">{formatDate(reply.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {!post.isLocked && (
                          <button
                            onClick={() => {
                              if (!requireLogin()) return;
                              setQuotedReplyId(reply.id);
                              document.getElementById('reply-form')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="text-xs text-gray-400 hover:text-blue-600"
                          >
                            引用
                          </button>
                        )}
                        {/* 檢舉回覆 */}
                        {user?.id !== reply.author.id && (
                          <button
                            onClick={() => {
                              if (!requireLogin()) return;
                              setReportTarget({ replyId: reply.id });
                              setShowReport(true);
                            }}
                            className="text-xs text-gray-400 hover:text-red-500"
                            title="檢舉回覆"
                          >
                            檢舉
                          </button>
                        )}
                        <span className="text-xs text-gray-400">推 {reply._count.pushes}</span>
                      </div>
                    </div>

                    {reply.quotedReply && (
                      <div className="mb-2 p-2 bg-gray-50 rounded text-xs text-gray-500 border-l-2 border-gray-300">
                        <span className="font-medium">B{reply.quotedReply.floorNumber} {reply.quotedReply.author.nickname}：</span>
                        {reply.quotedReply.content.substring(0, 100)}
                        {reply.quotedReply.content.length > 100 && '...'}
                      </div>
                    )}

                    <div className="text-gray-800 text-sm">
                      <RichTextContent content={reply.content} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 回覆分頁 */}
        {totalReplyPages > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            <button
              disabled={replyPage <= 1}
              onClick={() => setReplyPage(replyPage - 1)}
              className="px-3 py-1.5 rounded border text-sm disabled:opacity-30 hover:bg-gray-50"
            >
              上一頁
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-500">{replyPage} / {totalReplyPages}</span>
            <button
              disabled={replyPage >= totalReplyPages}
              onClick={() => setReplyPage(replyPage + 1)}
              className="px-3 py-1.5 rounded border text-sm disabled:opacity-30 hover:bg-gray-50"
            >
              下一頁
            </button>
          </div>
        )}
      </div>

      {/* 回覆表單 */}
      {post.isLocked ? (
        <div className="text-center py-6 bg-gray-50 rounded-lg text-gray-500 text-sm">
          此文章已鎖定，無法回覆
        </div>
      ) : user ? (
        <form id="reply-form" onSubmit={handleReply} className="bg-white border border-gray-200 rounded-lg p-4 mb-8">
          <h3 className="font-medium mb-3">回覆文章</h3>

          {quotedReplyId && (
            <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
              <span>引用 B{replies.find((r) => r.id === quotedReplyId)?.floorNumber}</span>
              <button
                type="button"
                onClick={() => setQuotedReplyId(null)}
                className="text-red-400 hover:text-red-600"
              >
                取消引用
              </button>
            </div>
          )}

          <div className="mb-3">
            <RichTextEditor
              content={replyContent}
              onChange={setReplyContent}
              placeholder="輸入你的回覆..."
              compact
              minHeight="120px"
            />
          </div>
          <button
            type="submit"
            disabled={replyMutation.isPending || isReplyEmpty}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            {replyMutation.isPending ? '送出中...' : '送出回覆'}
          </button>
        </form>
      ) : (
        <div className="text-center py-6 bg-gray-50 rounded-lg text-sm mb-8">
          <p className="text-gray-500 mb-2">想參與討論嗎？</p>
          <button
            onClick={requireLogin}
            className="text-blue-600 hover:text-blue-700 font-medium hover:underline"
          >
            登入後即可回覆
          </button>
        </div>
      )}

      {/* 檢舉 Modal */}
      {showReport && (
        <ReportModal
          postId={reportTarget.postId}
          replyId={reportTarget.replyId}
          onClose={() => setShowReport(false)}
        />
      )}

      {/* 刪除確認 Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center">
            <h3 className="text-lg font-semibold mb-2">確定刪除文章？</h3>
            <p className="text-gray-500 text-sm mb-5">此操作無法復原，文章及所有回覆將永久刪除。</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? '刪除中...' : '確定刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
