'use client';

import React, { useState, useMemo } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Popconfirm, Tag,
  message, Tabs, Card, Statistic, Row, Col, Typography, Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';

import { adminApiFetch } from '@/lib/api';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.goboka.net';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api';

type Status = 'ACTIVE' | 'DISABLED';

interface Partner {
  id: string;
  name: string;
  contact: string | null;
  note: string | null;
  status: Status;
  createdAt: string;
  _count?: { codes: number };
}

interface Code {
  id: string;
  code: string;
  channel: string | null;
  status: Status;
  expiresAt: string | null;
  note: string | null;
  partnerId: string;
  partner: { id: string; name: string; status: Status };
  createdAt: string;
}

interface ReportCodeRow {
  codeId: string;
  code: string;
  channel: string | null;
  status: Status;
  partnerId: string;
  partnerName: string;
  visits: number;
  registrations: number;
  verified: number;
  regRate: number;
  verifyRate: number;
}
interface ReportPartnerRow {
  partnerId: string;
  partnerName: string;
  codeCount: number;
  visits: number;
  registrations: number;
  verified: number;
  regRate: number;
  verifyRate: number;
}
interface ReportData {
  codes: ReportCodeRow[];
  partners: ReportPartnerRow[];
  totals: { visits: number; registrations: number; verified: number; regRate: number; verifyRate: number };
  trend: { day: string; visits: number; registrations: number }[];
}

const STATUS_TAG: Record<Status, { color: string; label: string }> = {
  ACTIVE: { color: 'green', label: '啟用' },
  DISABLED: { color: 'default', label: '停用' },
};

function promoLink(code: string) {
  return `${SITE_URL}/r/${code}`;
}

function todayStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    message.success('已複製：' + text);
  } catch {
    message.error('複製失敗，請手動複製');
  }
}

export default function PromoPage() {
  return (
    <div>
      <Typography.Title level={3}>推廣管理</Typography.Title>
      <Tabs
        defaultActiveKey="report"
        items={[
          { key: 'report', label: '漏斗報表', children: <ReportTab /> },
          { key: 'partners', label: '推廣廠商', children: <PartnersTab /> },
          { key: 'codes', label: '推廣碼', children: <CodesTab /> },
        ]}
      />
    </div>
  );
}

// ===================== 漏斗報表 =====================
function ReportTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [partnerId, setPartnerId] = useState<string | undefined>(undefined);

  const { data: partnersRes } = useQuery({
    queryKey: ['promo-partners'],
    queryFn: () => adminApiFetch<{ data: Partner[] }>('/admin/promo/partners'),
  });

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', new Date(`${from}T00:00:00`).toISOString());
    if (to) p.set('to', new Date(`${to}T23:59:59`).toISOString());
    if (partnerId) p.set('partnerId', partnerId);
    return p;
  }, [from, to, partnerId]);

  const { data, isLoading } = useQuery({
    queryKey: ['promo-report', params.toString()],
    queryFn: () => adminApiFetch<{ data: ReportData }>(`/admin/promo/report?${params.toString()}`),
  });

  const report = data?.data;

  const downloadCsv = async () => {
    try {
      const token = localStorage.getItem('admin_accessToken');
      const res = await fetch(`${API_URL}/admin/promo/report.csv?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('匯出失敗');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `promo-report-${todayStamp()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error('CSV 匯出失敗');
    }
  };

  const codeColumns: ColumnsType<ReportCodeRow> = [
    { title: '廠商', dataIndex: 'partnerName' },
    { title: '推廣碼', dataIndex: 'code', render: (c) => <Tag>{c}</Tag> },
    { title: '渠道', dataIndex: 'channel', render: (c) => c || '—' },
    { title: '不重複點擊', dataIndex: 'visits', sorter: (a, b) => a.visits - b.visits },
    { title: '註冊數', dataIndex: 'registrations', sorter: (a, b) => a.registrations - b.registrations },
    {
      title: '手機驗證數',
      dataIndex: 'verified',
      sorter: (a, b) => a.verified - b.verified,
      render: (v) => <strong>{v}</strong>,
    },
    { title: '點擊→註冊', dataIndex: 'regRate', render: (r) => `${r}%` },
    { title: '註冊→驗證', dataIndex: 'verifyRate', render: (r) => `${r}%` },
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <span>區間：</span>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 160 }} />
        <span>~</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 160 }} />
        <Select
          placeholder="全部廠商"
          allowClear
          style={{ minWidth: 180 }}
          value={partnerId}
          onChange={(v) => setPartnerId(v)}
          options={(partnersRes?.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
        />
        <Button icon={<DownloadOutlined />} onClick={downloadCsv}>
          匯出 CSV（結算用）
        </Button>
      </Space>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="不重複點擊" value={report?.totals.visits ?? 0} /></Card></Col>
        <Col span={6}><Card><Statistic title="註冊數" value={report?.totals.registrations ?? 0} /></Card></Col>
        <Col span={6}><Card><Statistic title="手機驗證數" value={report?.totals.verified ?? 0} valueStyle={{ color: '#3f8600' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="點擊→註冊轉換" value={report?.totals.regRate ?? 0} suffix="%" /></Card></Col>
      </Row>

      <Card size="small" title="各推廣碼成效" style={{ marginBottom: 16 }}>
        <Table
          rowKey="codeId"
          size="small"
          loading={isLoading}
          dataSource={report?.codes ?? []}
          columns={codeColumns}
          pagination={false}
        />
      </Card>

      <Card size="small" title="各廠商彙總">
        <Table
          rowKey="partnerId"
          size="small"
          dataSource={report?.partners ?? []}
          pagination={false}
          columns={[
            { title: '廠商', dataIndex: 'partnerName' },
            { title: '碼數', dataIndex: 'codeCount' },
            { title: '不重複點擊', dataIndex: 'visits' },
            { title: '註冊數', dataIndex: 'registrations' },
            { title: '手機驗證數', dataIndex: 'verified', render: (v) => <strong>{v}</strong> },
            { title: '點擊→註冊', dataIndex: 'regRate', render: (r) => `${r}%` },
            { title: '註冊→驗證', dataIndex: 'verifyRate', render: (r) => `${r}%` },
          ]}
        />
      </Card>
    </div>
  );
}

// ===================== 推廣廠商 =====================
function PartnersTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['promo-partners'],
    queryFn: () => adminApiFetch<{ data: Partner[] }>('/admin/promo/partners'),
  });

  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      editing
        ? adminApiFetch(`/admin/promo/partners/${editing.id}`, { method: 'PATCH', body: JSON.stringify(values) })
        : adminApiFetch('/admin/promo/partners', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: () => {
      message.success('已儲存');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['promo-partners'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => adminApiFetch(`/admin/promo/partners/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('已刪除');
      qc.invalidateQueries({ queryKey: ['promo-partners'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const columns: ColumnsType<Partner> = [
    { title: '廠商名稱', dataIndex: 'name' },
    { title: '聯絡方式', dataIndex: 'contact', render: (c) => c || '—' },
    { title: '推廣碼數', dataIndex: ['_count', 'codes'], render: (n) => n ?? 0 },
    { title: '狀態', dataIndex: 'status', render: (s: Status) => <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].label}</Tag> },
    { title: '備註', dataIndex: 'note', render: (c) => c || '—' },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(r); form.setFieldsValue(r); setOpen(true); }}>編輯</Button>
          <Popconfirm title="刪除後其下推廣碼與數據將一併移除，確定？" onConfirm={() => del.mutate(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>刪除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 16 }}
        onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>
        新增廠商
      </Button>
      <Table rowKey="id" loading={isLoading} dataSource={data?.data ?? []} columns={columns} />

      <Modal
        title={editing ? '編輯廠商' : '新增廠商'}
        open={open}
        onCancel={() => { setOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="name" label="廠商名稱" rules={[{ required: true, message: '請輸入名稱' }]}>
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="contact" label="聯絡方式"><Input maxLength={120} /></Form.Item>
          <Form.Item name="note" label="備註"><Input.TextArea maxLength={500} rows={2} /></Form.Item>
          {editing && (
            <Form.Item name="status" label="狀態">
              <Select options={[{ value: 'ACTIVE', label: '啟用' }, { value: 'DISABLED', label: '停用（其下碼一律失效）' }]} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}

// ===================== 推廣碼 =====================
function CodesTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Code | null>(null);
  const [form] = Form.useForm();

  const { data: partnersRes } = useQuery({
    queryKey: ['promo-partners'],
    queryFn: () => adminApiFetch<{ data: Partner[] }>('/admin/promo/partners'),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['promo-codes'],
    queryFn: () => adminApiFetch<{ data: Code[] }>('/admin/promo/codes'),
  });

  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) => {
      // expiresAt 來自 <input type="datetime-local">（本地時間字串），後端以 new Date() 解析
      const payload = {
        ...values,
        expiresAt: (values.expiresAt as string) || undefined,
      };
      return editing
        ? adminApiFetch(`/admin/promo/codes/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : adminApiFetch('/admin/promo/codes', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      message.success('已儲存');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['promo-codes'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => adminApiFetch(`/admin/promo/codes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('已刪除');
      qc.invalidateQueries({ queryKey: ['promo-codes'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  // ISO → <input type="datetime-local"> 需要的本地格式 YYYY-MM-DDTHH:mm
  const toLocalInput = (iso: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const columns: ColumnsType<Code> = [
    { title: '推廣碼', dataIndex: 'code', render: (c) => <Tag color="blue">{c}</Tag> },
    { title: '廠商', dataIndex: ['partner', 'name'] },
    { title: '渠道', dataIndex: 'channel', render: (c) => c || '—' },
    { title: '狀態', dataIndex: 'status', render: (s: Status) => <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].label}</Tag> },
    {
      title: '到期',
      dataIndex: 'expiresAt',
      render: (d) => (d ? new Date(d).toLocaleDateString() : '永久'),
    },
    {
      title: '推廣連結',
      render: (_, r) => (
        <Tooltip title={promoLink(r.code)}>
          <Button size="small" icon={<CopyOutlined />} onClick={() => copy(promoLink(r.code))}>複製連結</Button>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />}
            onClick={() => {
              setEditing(r);
              form.setFieldsValue({ ...r, expiresAt: toLocalInput(r.expiresAt) });
              setOpen(true);
            }}>編輯</Button>
          <Popconfirm title="刪除後此碼的點擊/歸因數據將移除，建議改停用。確定刪除？" onConfirm={() => del.mutate(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>刪除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 16 }}
        onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>
        新增推廣碼
      </Button>
      <Table rowKey="id" loading={isLoading} dataSource={data?.data ?? []} columns={columns} />

      <Modal
        title={editing ? '編輯推廣碼' : '新增推廣碼'}
        open={open}
        onCancel={() => { setOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          {!editing && (
            <>
              <Form.Item name="partnerId" label="所屬廠商" rules={[{ required: true, message: '請選擇廠商' }]}>
                <Select
                  placeholder="選擇廠商"
                  options={(partnersRes?.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
                />
              </Form.Item>
              <Form.Item name="code" label="自訂碼（留空自動產生）" rules={[{ pattern: /^[A-Za-z0-9]{4,32}$/, message: '4-32 碼英數字' }]}>
                <Input placeholder="例：FB2026（留空系統自動產生）" maxLength={32} />
              </Form.Item>
            </>
          )}
          <Form.Item name="channel" label="渠道標記"><Input placeholder="FB / IG / LINE…" maxLength={40} /></Form.Item>
          <Form.Item name="expiresAt" label="到期時間（留空=永久）">
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="note" label="備註"><Input.TextArea maxLength={500} rows={2} /></Form.Item>
          {editing && (
            <Form.Item name="status" label="狀態">
              <Select options={[{ value: 'ACTIVE', label: '啟用' }, { value: 'DISABLED', label: '停用' }]} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
