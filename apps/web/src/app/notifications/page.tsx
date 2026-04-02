'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth';
import { apiFetch } from '@/lib/api';

interface NotificationItem {
  id: string;
  type: string;
  content: string;
  sourceUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  data: {
    items: NotificationItem[];
    total: number;
    unreadCount: number;
    page: number;
    limit: number;
  };
}

const TYPE_ICONS: Record<string, string> = {
  REPLY: '💬',
  PUSH: '👍',
  FOLLOW: '👤',
  SYSTEM: '📢',
};

const TYPE_LABELS: Record<string, string> = {
  '': '全部',
  REPLY: '回覆',
  PUSH: '推文',
  FOLLOW: '追蹤',
  SYSTEM: '系統',
};

export default function NotificationsPage() {
  const { user, accessToken, requireLogin } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', page, typeFilter],
    queryFn: () =>
      apiFetch<NotificationsResponse>(`/notifications?page=${page}&limit=20${typeFilter ? `&type=${typeFilter}` : ''}`, {
        token: accessToken ?? undefined,
      }),
    enabled: !!accessToken,
  });

  const markAllMutation = useMutation({
    mutationFn: () =>
      apiFetch('/notifications/read-all', { method: 'PATCH', token: accessToken ?? undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markOneMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/notifications/${id}/read`, { method: 'PATCH', token: accessToken ?? undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const items = data?.data.items ?? [];
  const total = data?.data.total ?? 0;
  const unreadCount = data?.data.unreadCount ?? 0;
  const totalPages = Math.ceil(total / 20);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p className="text-gray-400 mb-2">登入後即可查看通知</p>
        <button onClick={() => requireLogin()} className="text-blue-600 hover:underline font-medium">立即登入</button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">
          通知中心
          {unreadCount > 0 && (
            <span className="ml-2 text-sm font-normal text-blue-600">
              ({unreadCount} 則未讀)
            </span>
          )}
        </h1>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllMutation.mutate()}
            className="text-sm text-blue-600 hover:underline"
          >
            全部標為已讀
          </button>
        )}
      </div>

      {/* 分類篩選 */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {Object.entries(TYPE_LABELS).map(([value, label]) => (
          <button
            key={value}
            onClick={() => { setTypeFilter(value); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              typeFilter === value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {value ? `${TYPE_ICONS[value] ?? ''} ` : ''}{label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-400">載入中...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 mb-1">{typeFilter ? '此分類沒有通知' : '目前沒有新通知'}</p>
          <p className="text-gray-300 text-sm">當有人回覆你的文章或推文時，會在這裡通知你</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {items.map((n) => {
            const inner = (
              <div
                className={`flex items-start gap-3 py-3 px-3 rounded transition-colors ${
                  n.isRead ? 'opacity-60' : 'bg-blue-50/50'
                } hover:bg-gray-50`}
              >
                <span className="text-lg mt-0.5">{TYPE_ICONS[n.type] ?? '🔔'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800">{n.content}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(n.createdAt).toLocaleString('zh-TW')}
                  </div>
                </div>
                {!n.isRead && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      markOneMutation.mutate(n.id);
                    }}
                    className="text-xs text-blue-500 hover:underline shrink-0"
                  >
                    已讀
                  </button>
                )}
              </div>
            );

            return n.sourceUrl ? (
              <Link key={n.id} href={n.sourceUrl}>{inner}</Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded border text-sm disabled:opacity-30 hover:bg-gray-50">上一頁</button>
          <span className="px-3 py-1.5 text-sm text-gray-500">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded border text-sm disabled:opacity-30 hover:bg-gray-50">下一頁</button>
        </div>
      )}
    </div>
  );
}
