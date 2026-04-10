'use client';

import React, { useState } from 'react';
import { Table, Button, Switch, Tag, message } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';

import { adminApiFetch } from '@/lib/api';

interface PostItem {
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
  author: { id: string; nickname: string };
  board: { id: string; name: string };
}

interface PostsResponse {
  data: { items: PostItem[]; total: number; page: number; limit: number };
}

export default function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-announcements', page],
    queryFn: () => adminApiFetch<PostsResponse>(`/admin/posts?page=${page}&limit=20&isAnnounce=true`),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, boolean> }) =>
      adminApiFetch(`/admin/posts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      message.success('更新成功');
      queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const columns: ColumnsType<PostItem> = [
    {
      title: '標題',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{title}</div>
          <div style={{ fontSize: 12, color: '#999' }}>
            {record.author.nickname} · {record.board.name}
          </div>
        </div>
      ),
    },
    { title: '瀏覽', dataIndex: 'viewCount', key: 'viewCount', width: 70 },
    { title: '回覆', dataIndex: 'replyCount', key: 'replyCount', width: 70 },
    {
      title: '置頂',
      key: 'isPinned',
      width: 70,
      render: (_, record) => (
        <Switch
          size="small"
          checked={record.isPinned}
          onChange={(v) => toggleMutation.mutate({ id: record.id, body: { isPinned: v } })}
        />
      ),
    },
    {
      title: '鎖定',
      key: 'isLocked',
      width: 70,
      render: (_, record) => (
        <Switch
          size="small"
          checked={record.isLocked}
          onChange={(v) => toggleMutation.mutate({ id: record.id, body: { isLocked: v } })}
        />
      ),
    },
    {
      title: '公告',
      key: 'isAnnounce',
      width: 70,
      render: (_, record) => (
        <Switch
          size="small"
          checked={record.isAnnounce}
          onChange={(v) => toggleMutation.mutate({ id: record.id, body: { isAnnounce: v } })}
        />
      ),
    },
    {
      title: '時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 110,
      render: (d) => new Date(d).toLocaleDateString('zh-TW'),
    },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>公告管理</h2>
      <p style={{ color: '#999', marginBottom: 16, fontSize: 14 }}>
        此頁面顯示所有標記為公告的文章。您可在「文章管理」將任意文章設為公告。
      </p>
      <Table
        columns={columns}
        dataSource={data?.data.items}
        rowKey="id"
        loading={isLoading}
        pagination={{
          current: page,
          pageSize: 20,
          total: data?.data.total ?? 0,
          onChange: setPage,
          showTotal: (total) => `共 ${total} 篇公告`,
        }}
        size="middle"
        scroll={{ x: 800 }}
      />
    </div>
  );
}
