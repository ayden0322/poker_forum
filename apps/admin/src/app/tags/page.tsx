'use client';

import React, { useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space, Popconfirm, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';

import { adminApiFetch } from '@/lib/api';

type TagScope = 'GLOBAL' | 'SPORTS' | 'LOTTERY';

interface TagItem {
  id: string;
  name: string;
  slug: string;
  scope: TagScope;
  sortOrder: number;
  _count: { posts: number };
}

// 適用範圍：決定哪些分類的看板能用此標籤（對齊後端 Category.type）
const SCOPE_OPTIONS: { value: TagScope; label: string; color: string }[] = [
  { value: 'GLOBAL', label: '通用（所有看板）', color: 'default' },
  { value: 'SPORTS', label: '體育共用（籃球/足球/棒球/其他運動）', color: 'blue' },
  { value: 'LOTTERY', label: '彩券（台灣彩票）', color: 'gold' },
];
const SCOPE_MAP = Object.fromEntries(SCOPE_OPTIONS.map((o) => [o.value, o]));

export default function TagsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TagItem | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tags'],
    queryFn: () => adminApiFetch<{ data: TagItem[] }>('/admin/tags'),
  });

  const saveMutation = useMutation({
    mutationFn: (values: { name: string; slug: string; scope: TagScope; sortOrder: number }) => {
      if (editing) return adminApiFetch(`/admin/tags/${editing.id}`, { method: 'PATCH', body: JSON.stringify(values) });
      return adminApiFetch('/admin/tags', { method: 'POST', body: JSON.stringify(values) });
    },
    onSuccess: () => { message.success('儲存成功'); setModalOpen(false); setEditing(null); queryClient.invalidateQueries({ queryKey: ['admin-tags'] }); },
    onError: (err: Error) => message.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApiFetch(`/admin/tags/${id}`, { method: 'DELETE' }),
    onSuccess: () => { message.success('刪除成功'); queryClient.invalidateQueries({ queryKey: ['admin-tags'] }); },
    onError: (err: Error) => message.error(err.message),
  });

  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ scope: 'GLOBAL', sortOrder: 0 }); setModalOpen(true); };
  const openEdit = (t: TagItem) => { setEditing(t); form.setFieldsValue({ name: t.name, slug: t.slug, scope: t.scope, sortOrder: t.sortOrder }); setModalOpen(true); };

  const columns: ColumnsType<TagItem> = [
    { title: '名稱', dataIndex: 'name', key: 'name' },
    { title: 'Slug', dataIndex: 'slug', key: 'slug' },
    {
      title: '適用範圍', dataIndex: 'scope', key: 'scope', width: 120,
      render: (s: TagScope) => <Tag color={SCOPE_MAP[s]?.color}>{SCOPE_MAP[s]?.label.split('（')[0] ?? s}</Tag>,
    },
    { title: '順序', dataIndex: 'sortOrder', key: 'sortOrder', width: 70 },
    { title: '文章數', key: 'posts', width: 80, render: (_, r) => r._count.posts },
    {
      title: '操作', key: 'actions', width: 150,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>編輯</Button>
          <Popconfirm title="確定刪除？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>刪除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 'bold' }}>標籤管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增標籤</Button>
      </div>
      <Table columns={columns} dataSource={data?.data} rowKey="id" loading={isLoading} pagination={false} size="middle" scroll={{ x: 400 }} />
      <Modal
        title={editing ? '編輯標籤' : '新增標籤'}
        open={modalOpen}
        onOk={() => form.validateFields().then((v) => saveMutation.mutate(v))}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        confirmLoading={saveMutation.isPending}
        okText="儲存" cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="名稱" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="Slug" name="slug" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="適用範圍" name="scope" rules={[{ required: true }]} extra="決定哪些分類的看板能在發文與篩選看到此標籤">
            <Select options={SCOPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
          </Form.Item>
          <Form.Item label="顯示順序" name="sortOrder"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
