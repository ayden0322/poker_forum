'use client';

import React, { useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, Switch,
  Space, Tag, message, Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';

import { adminApiFetch } from '@/lib/api';

interface Board {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  categoryId: string;
  category: { id: string; name: string };
  _count: { posts: number };
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function BoardsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Board | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-boards'],
    queryFn: () => adminApiFetch<{ data: Board[] }>('/admin/boards'),
  });

  const { data: catData } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => adminApiFetch<{ data: Category[] }>('/admin/categories'),
  });

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => {
      if (editing) {
        return adminApiFetch(`/admin/boards/${editing.id}`, { method: 'PATCH', body: JSON.stringify(values) });
      }
      return adminApiFetch('/admin/boards', { method: 'POST', body: JSON.stringify(values) });
    },
    onSuccess: () => {
      message.success(editing ? '更新成功' : '新增成功');
      setModalOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['admin-boards'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApiFetch(`/admin/boards/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('刪除成功');
      queryClient.invalidateQueries({ queryKey: ['admin-boards'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ sortOrder: 0, isActive: true });
    setModalOpen(true);
  };

  const openEdit = (board: Board) => {
    setEditing(board);
    form.setFieldsValue({
      categoryId: board.categoryId,
      name: board.name,
      slug: board.slug,
      description: board.description,
      icon: board.icon,
      sortOrder: board.sortOrder,
      isActive: board.isActive,
    });
    setModalOpen(true);
  };

  const columns: ColumnsType<Board> = [
    { title: '圖示', dataIndex: 'icon', key: 'icon', width: 60, render: (v) => v ?? '💬' },
    { title: '名稱', dataIndex: 'name', key: 'name' },
    { title: 'Slug', dataIndex: 'slug', key: 'slug' },
    {
      title: '分類',
      key: 'category',
      render: (_, r) => <Tag>{r.category.name}</Tag>,
    },
    { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 70 },
    { title: '文章數', key: 'posts', width: 80, render: (_, r) => r._count.posts },
    {
      title: '狀態',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (v) => v ? <Tag color="success">啟用</Tag> : <Tag color="default">停用</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>編輯</Button>
          <Popconfirm title="確定要刪除此看板？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>刪除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const categoryOptions = (catData?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 'bold' }}>看板管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增看板</Button>
      </div>

      <Table
        columns={columns}
        dataSource={data?.data}
        rowKey="id"
        loading={isLoading}
        pagination={false}
        size="middle"
        scroll={{ x: 600 }}
      />

      <Modal
        title={editing ? '編輯看板' : '新增看板'}
        open={modalOpen}
        onOk={() => form.validateFields().then((v) => saveMutation.mutate(v))}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        confirmLoading={saveMutation.isPending}
        okText="儲存"
        cancelText="取消"
        width={520}
        styles={{ wrapper: { maxWidth: '100vw' } }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="分類" name="categoryId" rules={[{ required: true, message: '請選擇分類' }]}>
            <Select options={categoryOptions} placeholder="選擇分類" />
          </Form.Item>
          <Form.Item label="名稱" name="name" rules={[{ required: true, message: '請輸入名稱' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Slug" name="slug" rules={[{ required: true, message: '請輸入 Slug' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="說明" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item label="圖示 (Emoji)" name="icon">
              <Input style={{ width: 80 }} />
            </Form.Item>
            <Form.Item label="排序" name="sortOrder">
              <InputNumber min={0} style={{ width: 100 }} />
            </Form.Item>
            <Form.Item label="啟用" name="isActive" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
