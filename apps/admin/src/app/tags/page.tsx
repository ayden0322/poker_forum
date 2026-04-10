'use client';

import React, { useState } from 'react';
import { Table, Button, Modal, Form, Input, Space, Popconfirm, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';

import { adminApiFetch } from '@/lib/api';

interface TagItem {
  id: string;
  name: string;
  slug: string;
  _count: { posts: number };
}

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
    mutationFn: (values: { name: string; slug: string }) => {
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

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (t: TagItem) => { setEditing(t); form.setFieldsValue({ name: t.name, slug: t.slug }); setModalOpen(true); };

  const columns: ColumnsType<TagItem> = [
    { title: '名稱', dataIndex: 'name', key: 'name' },
    { title: 'Slug', dataIndex: 'slug', key: 'slug' },
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
        </Form>
      </Modal>
    </div>
  );
}
