'use client';

import React, { useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Switch, Select,
  Space, Popconfirm, Tag, message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';

import { adminApiFetch } from '@/lib/api';

type CosmeticType = 'FRAME' | 'BADGE' | 'TITLE' | 'EFFECT';
type Rarity = 'COMMON' | 'RARE' | 'LEGENDARY';

interface CosmeticItem {
  id: string;
  type: CosmeticType;
  name: string;
  description: string | null;
  iconKey: string | null;
  rarity: Rarity;
  priceG: number | null;
  purchasable: boolean;
  levelRequired: number | null;
  enabled: boolean;
  availableFrom: string | null;
  availableTo: string | null;
  sortOrder: number;
}

const TYPE_LABEL: Record<CosmeticType, string> = { FRAME: '頭像裝飾', BADGE: '勳章', TITLE: '稱號', EFFECT: '頭像特效' };
const RARITY_LABEL: Record<Rarity, string> = { COMMON: '普通', RARE: '稀有', LEGENDARY: '傳說' };
const RARITY_COLOR: Record<Rarity, string> = { COMMON: 'default', RARE: 'cyan', LEGENDARY: 'gold' };

// 勳章可選的 lucide 圖示（前端用同名 lucide-react 渲染）；可再擴充
const LUCIDE_OPTIONS = [
  'pencil-line', 'message-square', 'flame', 'target', 'crown', 'gem',
  'star', 'award', 'shield', 'trophy', 'heart', 'zap', 'medal', 'sparkles',
].map((v) => ({ value: v, label: v }));

// ISO → <input type="datetime-local"> 需要的本地格式 YYYY-MM-DDTHH:mm
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CosmeticsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CosmeticItem | null>(null);
  const [form] = Form.useForm();
  const watchType = Form.useWatch('type', form);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-cosmetics'],
    queryFn: () => adminApiFetch<{ data: CosmeticItem[] }>('/admin/cosmetics'),
  });

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => {
      // availableFrom/To 為文字（ISO 或 datetime-local），後端以 new Date() 解析；空字串轉 undefined
      const payload = {
        ...values,
        availableFrom: (values.availableFrom as string) || undefined,
        availableTo: (values.availableTo as string) || undefined,
      };
      if (editing) {
        // type 不可更新（後端 UpdateDto 白名單無 type，送了會「property type should not exist」）
        const patch: Record<string, unknown> = { ...payload };
        delete patch.type;
        return adminApiFetch(`/admin/cosmetics/${editing.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      }
      return adminApiFetch('/admin/cosmetics', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      message.success('儲存成功');
      setModalOpen(false); setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['admin-cosmetics'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApiFetch(`/admin/cosmetics/${id}`, { method: 'DELETE' }),
    onSuccess: () => { message.success('刪除成功'); queryClient.invalidateQueries({ queryKey: ['admin-cosmetics'] }); },
    onError: (err: Error) => message.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: 'enabled' | 'purchasable'; value: boolean }) =>
      adminApiFetch(`/admin/cosmetics/${id}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-cosmetics'] }),
    onError: (err: Error) => message.error(err.message),
  });

  const openCreate = () => {
    setEditing(null); form.resetFields();
    form.setFieldsValue({ type: 'FRAME', rarity: 'COMMON', purchasable: true, enabled: true, sortOrder: 0 });
    setModalOpen(true);
  };
  const openEdit = (c: CosmeticItem) => {
    setEditing(c);
    form.setFieldsValue({
      ...c,
      availableFrom: toLocalInput(c.availableFrom),
      availableTo: toLocalInput(c.availableTo),
    });
    setModalOpen(true);
  };

  const columns: ColumnsType<CosmeticItem> = [
    { title: '類型', dataIndex: 'type', key: 'type', width: 80, render: (t: CosmeticType) => TYPE_LABEL[t] },
    { title: '圖示(lucide)', dataIndex: 'iconKey', key: 'iconKey', width: 120, render: (k: string | null) => k ?? '—' },
    { title: '名稱', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: '稀有度', dataIndex: 'rarity', key: 'rarity', width: 80, render: (r: Rarity) => <Tag color={RARITY_COLOR[r]}>{RARITY_LABEL[r]}</Tag> },
    { title: 'G幣價', dataIndex: 'priceG', key: 'priceG', width: 80, render: (v: number | null) => (v ?? '非販售') },
    { title: '需求等級', dataIndex: 'levelRequired', key: 'levelRequired', width: 80, render: (v: number | null) => (v ? `Lv.${v}` : '—') },
    { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 60 },
    {
      title: '販售', key: 'purchasable', width: 70,
      render: (_, r) => <Switch size="small" checked={r.purchasable} onChange={(v) => toggleMutation.mutate({ id: r.id, field: 'purchasable', value: v })} />,
    },
    {
      title: '上架', key: 'enabled', width: 70,
      render: (_, r) => <Switch size="small" checked={r.enabled} onChange={(v) => toggleMutation.mutate({ id: r.id, field: 'enabled', value: v })} />,
    },
    {
      title: '操作', key: 'actions', width: 150, fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>編輯</Button>
          <Popconfirm title="確定刪除？（有人擁有則無法刪，請改用停售/撤除）" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>刪除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 'bold' }}>裝飾商店管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增裝飾</Button>
      </div>
      <Table columns={columns} dataSource={data?.data} rowKey="id" loading={isLoading} pagination={false} size="middle" scroll={{ x: 900 }} />

      <Modal
        title={editing ? '編輯裝飾' : '新增裝飾'}
        open={modalOpen}
        onOk={() => form.validateFields().then((v) => saveMutation.mutate(v))}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        confirmLoading={saveMutation.isPending}
        okText="儲存" cancelText="取消" width={560}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Space size="large">
            <Form.Item label="類型" name="type" rules={[{ required: true }]}>
              <Select disabled={!!editing} style={{ width: 140 }} options={(['FRAME', 'BADGE', 'TITLE'] as CosmeticType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
            </Form.Item>
            <Form.Item label="稀有度" name="rarity" rules={[{ required: true }]}>
              <Select style={{ width: 140 }} options={(['COMMON', 'RARE', 'LEGENDARY'] as Rarity[]).map((r) => ({ value: r, label: RARITY_LABEL[r] }))} />
            </Form.Item>
          </Space>
          <Form.Item label="名稱" name="name" rules={[{ required: true, message: '請輸入名稱' }, { max: 40 }]}>
            <Input maxLength={40} />
          </Form.Item>
          <Form.Item label="說明（選填）" name="description"><Input.TextArea rows={2} maxLength={200} /></Form.Item>

          {watchType === 'BADGE' && (
            <Form.Item
              label="勳章圖示（lucide，前端會用同名 icon 渲染）"
              name="iconKey"
              rules={[{ required: true, message: '請選擇 lucide 圖示' }]}
            >
              <Select showSearch options={LUCIDE_OPTIONS} placeholder="選一個 lucide icon（可搜尋）" />
            </Form.Item>
          )}

          <Space size="large" wrap>
            <Form.Item label="G幣價（空=非販售）" name="priceG"><InputNumber min={0} placeholder="非販售留空" /></Form.Item>
            <Form.Item label="需求等級（選填）" name="levelRequired"><InputNumber min={1} /></Form.Item>
            <Form.Item label="排序" name="sortOrder"><InputNumber min={0} /></Form.Item>
          </Space>
          <Space size="large" wrap>
            <Form.Item label="限時上架起（選填）" name="availableFrom"><Input type="datetime-local" /></Form.Item>
            <Form.Item label="限時上架迄（選填）" name="availableTo"><Input type="datetime-local" /></Form.Item>
          </Space>
          <Space size="large">
            <Form.Item label="販售中" name="purchasable" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item label="上架（關閉=撤除，會卸下所有人裝備）" name="enabled" valuePropName="checked"><Switch /></Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
