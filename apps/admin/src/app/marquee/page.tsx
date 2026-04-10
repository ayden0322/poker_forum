'use client';

import React, { useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Switch, Space, Popconfirm, Tag, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';

import { adminApiFetch } from '@/lib/api';

interface Marquee {
  id: string;
  content: string;
  url: string | null;
  isActive: boolean;
  sortOrder: number;
}

export default function MarqueePage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Marquee | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-marquees'],
    queryFn: () => adminApiFetch<{ data: Marquee[] }>('/admin/marquees'),
  });

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => {
      if (editing) return adminApiFetch(`/admin/marquees/${editing.id}`, { method: 'PATCH', body: JSON.stringify(values) });
      return adminApiFetch('/admin/marquees', { method: 'POST', body: JSON.stringify(values) });
    },
    onSuccess: () => { message.success('儲存成功'); setModalOpen(false); setEditing(null); queryClient.invalidateQueries({ queryKey: ['admin-marquees'] }); },
    onError: (err: Error) => message.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApiFetch(`/admin/marquees/${id}`, { method: 'DELETE' }),
    onSuccess: () => { message.success('刪除成功'); queryClient.invalidateQueries({ queryKey: ['admin-marquees'] }); },
    onError: (err: Error) => message.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminApiFetch(`/admin/marquees/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-marquees'] }),
  });

  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ sortOrder: 0, isActive: true }); setModalOpen(true); };
  const openEdit = (m: Marquee) => { setEditing(m); form.setFieldsValue(m); setModalOpen(true); };

  const columns: ColumnsType<Marquee> = [
    { title: '內容', dataIndex: 'content', key: 'content', ellipsis: true },
    { title: '連結', dataIndex: 'url', key: 'url', width: 200, render: (v) => v ?? '—' },
    { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 70 },
    { title: '狀態', key: 'isActive', width: 80, render: (_, r) => <Switch size="small" checked={r.isActive} onChange={(v) => toggleMutation.mutate({ id: r.id, isActive: v })} /> },
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
        <h2 style={{ fontSize: 20, fontWeight: 'bold' }}>跑馬燈管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>
      </div>
      <Table columns={columns} dataSource={data?.data} rowKey="id" loading={isLoading} pagination={false} size="middle" scroll={{ x: 600 }} />
      <Modal
        title={editing ? '編輯跑馬燈' : '新增跑馬燈'}
        open={modalOpen}
        onOk={() => form.validateFields().then((v) => saveMutation.mutate(v))}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        confirmLoading={saveMutation.isPending}
        okText="儲存" cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="內容" name="content" rules={[{ required: true, message: '請輸入內容' }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="連結（選填）" name="url"><Input placeholder="https://..." /></Form.Item>
          <Space>
            <Form.Item label="排序" name="sortOrder"><InputNumber min={0} /></Form.Item>
            <Form.Item label="啟用" name="isActive" valuePropName="checked"><Switch /></Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
