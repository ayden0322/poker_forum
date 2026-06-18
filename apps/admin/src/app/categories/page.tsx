'use client';

import React, { useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';

import { adminApiFetch } from '@/lib/api';

type CategoryType = 'SPORTS' | 'LOTTERY' | 'GENERAL';

interface Category {
  id: string;
  name: string;
  slug: string;
  type: CategoryType;
  sortOrder: number;
  _count: { boards: number };
}

// 分類型別：決定此分類底下看板可用的標籤集合（對齊後端 Tag.scope）
const TYPE_OPTIONS: { value: CategoryType; label: string; color: string }[] = [
  { value: 'SPORTS', label: '體育（吃通用＋體育共用標籤）', color: 'blue' },
  { value: 'LOTTERY', label: '彩券（吃通用＋彩券標籤）', color: 'gold' },
  { value: 'GENERAL', label: '綜合（只吃通用標籤）', color: 'default' },
];
const TYPE_MAP = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o]));

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => adminApiFetch<{ data: Category[] }>('/admin/categories'),
  });

  const saveMutation = useMutation({
    mutationFn: (values: { name: string; slug: string; sortOrder: number; type: CategoryType }) => {
      if (editing) {
        return adminApiFetch(`/admin/categories/${editing.id}`, { method: 'PATCH', body: JSON.stringify(values) });
      }
      return adminApiFetch('/admin/categories', { method: 'POST', body: JSON.stringify(values) });
    },
    onSuccess: () => {
      message.success(editing ? '更新成功' : '新增成功');
      setModalOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApiFetch(`/admin/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('刪除成功');
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ sortOrder: 0, type: 'GENERAL' });
    setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    form.setFieldsValue({ name: cat.name, slug: cat.slug, sortOrder: cat.sortOrder, type: cat.type });
    setModalOpen(true);
  };

  const columns: ColumnsType<Category> = [
    { title: '名稱', dataIndex: 'name', key: 'name' },
    { title: 'Slug', dataIndex: 'slug', key: 'slug' },
    {
      title: '型別', dataIndex: 'type', key: 'type', width: 90,
      render: (t: CategoryType) => <Tag color={TYPE_MAP[t]?.color}>{TYPE_MAP[t]?.label.split('（')[0] ?? t}</Tag>,
    },
    { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 80 },
    { title: '看板數', key: 'boards', width: 80, render: (_, r) => r._count.boards },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>編輯</Button>
          <Popconfirm title="確定要刪除此分類？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>刪除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 'bold' }}>分類管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增分類</Button>
      </div>

      <Table
        columns={columns}
        dataSource={data?.data}
        rowKey="id"
        loading={isLoading}
        pagination={false}
        size="middle"
      />

      <Modal
        title={editing ? '編輯分類' : '新增分類'}
        open={modalOpen}
        onOk={() => form.validateFields().then((v) => saveMutation.mutate(v))}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        confirmLoading={saveMutation.isPending}
        okText="儲存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="名稱" name="name" rules={[{ required: true, message: '請輸入名稱' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Slug" name="slug" rules={[{ required: true, message: '請輸入 Slug' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="型別" name="type" rules={[{ required: true }]} extra="決定此分類看板在發文與篩選看到哪些標籤">
            <Select options={TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
          </Form.Item>
          <Form.Item label="排序" name="sortOrder">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
