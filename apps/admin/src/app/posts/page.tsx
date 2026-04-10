'use client';

import React, { useState } from 'react';
import { Table, Button, Switch, Popconfirm, message, Drawer } from 'antd';
import { DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { Input } from 'antd';
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

export default function PostsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [previewPost, setPreviewPost] = useState<PostItem | null>(null);

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', '20');
  if (search) queryParams.set('q', search);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-posts', page, search],
    queryFn: () => adminApiFetch<PostsResponse>(`/admin/posts?${queryParams}`),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, boolean> }) =>
      adminApiFetch(`/admin/posts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-posts'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApiFetch(`/admin/posts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('刪除成功');
      queryClient.invalidateQueries({ queryKey: ['admin-posts'] });
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
    { title: '推', dataIndex: 'pushCount', key: 'pushCount', width: 60 },
    {
      title: '置頂', key: 'isPinned', width: 70,
      render: (_, record) => (
        <Switch size="small" checked={record.isPinned} onChange={(v) => toggleMutation.mutate({ id: record.id, body: { isPinned: v } })} />
      ),
    },
    {
      title: '公告', key: 'isAnnounce', width: 70,
      render: (_, record) => (
        <Switch size="small" checked={record.isAnnounce} onChange={(v) => toggleMutation.mutate({ id: record.id, body: { isAnnounce: v } })} />
      ),
    },
    {
      title: '鎖定', key: 'isLocked', width: 70,
      render: (_, record) => (
        <Switch size="small" checked={record.isLocked} onChange={(v) => toggleMutation.mutate({ id: record.id, body: { isLocked: v } })} />
      ),
    },
    {
      title: '時間', dataIndex: 'createdAt', key: 'createdAt', width: 110,
      render: (d) => new Date(d).toLocaleDateString('zh-TW'),
    },
    {
      title: '操作', key: 'actions', width: 140,
      render: (_, record) => (
        <span style={{ display: 'flex', gap: 4 }}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setPreviewPost(record)}>檢視</Button>
          <Popconfirm title="確定要刪除此文章？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>刪除</Button>
          </Popconfirm>
        </span>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 'bold' }}>文章管理</h2>
        <Input.Search
          placeholder="搜尋標題 / 作者"
          style={{ width: 250, maxWidth: '100%' }}
          onSearch={(v) => { setSearch(v); setPage(1); }}
          allowClear
          enterButton
        />
      </div>

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
          showTotal: (total) => `共 ${total} 篇文章`,
        }}
        size="middle"
        scroll={{ x: 900 }}
      />

      {/* 文章內容預覽 Drawer */}
      <Drawer
        title={previewPost?.title}
        open={!!previewPost}
        onClose={() => setPreviewPost(null)}
        width={520}
        styles={{ wrapper: { maxWidth: '100vw' } }}
      >
        {previewPost && (
          <div>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#999' }}>
              <div>作者：{previewPost.author.nickname}</div>
              <div>看板：{previewPost.board.name}</div>
              <div>時間：{new Date(previewPost.createdAt).toLocaleString('zh-TW')}</div>
              <div>瀏覽 {previewPost.viewCount} · 回覆 {previewPost.replyCount} · 推 {previewPost.pushCount}</div>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
              {previewPost.content}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
