'use client';

import React, { useState } from 'react';
import { Table, Select, Tag, message } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';

import { adminApiFetch } from '@/lib/api';

type Section = 'FEATURED' | 'DISCUSSION';

interface PostItem {
  id: string;
  title: string;
  content: string;
  section: Section;
  isPinned: boolean;
  isLocked: boolean;
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

/**
 * 「站方推送」管理頁
 * 顯示所有 section=FEATURED 的文章。
 * 可在此頁或文章管理頁切換任一篇文章的分區（上半部 / 下半部）。
 */
export default function FeaturedPostsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-featured-posts', page],
    queryFn: () =>
      adminApiFetch<PostsResponse>(
        `/admin/posts?page=${page}&limit=20&section=FEATURED`,
      ),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApiFetch(`/admin/posts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      message.success('更新成功');
      queryClient.invalidateQueries({ queryKey: ['admin-featured-posts'] });
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
      title: '分區',
      key: 'section',
      width: 140,
      render: (_, record) => (
        <Select<Section>
          size="small"
          value={record.section}
          style={{ width: 120 }}
          onChange={(v) =>
            updateMutation.mutate({ id: record.id, body: { section: v } })
          }
          options={[
            { value: 'FEATURED', label: '📣 站方推送' },
            { value: 'DISCUSSION', label: '玩家討論' },
          ]}
        />
      ),
    },
    {
      title: '狀態',
      key: 'flags',
      width: 120,
      render: (_, record) => (
        <>
          {record.isPinned && <Tag color="red">置頂</Tag>}
          {record.isLocked && <Tag>鎖定</Tag>}
        </>
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
      <h2 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>
        站方推送管理
      </h2>
      <p style={{ color: '#999', marginBottom: 16, fontSize: 14 }}>
        此頁顯示所有「站方推送」分區（板塊頁上半部）的文章。
        你可以在這裡或「文章管理」頁將任意文章移動到「玩家討論」分區。
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
          showTotal: (total) => `共 ${total} 篇站方推送`,
        }}
        size="middle"
        scroll={{ x: 800 }}
      />
    </div>
  );
}
