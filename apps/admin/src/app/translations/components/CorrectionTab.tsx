'use client';

import React, { useState } from 'react';
import {
  Card,
  Button,
  Space,
  Tag,
  Input,
  Select,
  Table,
  Modal,
  Form,
  Checkbox,
  message,
  Popconfirm,
  Upload,
  Row,
  Col,
  Statistic,
  Alert,
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  DownloadOutlined,
  UploadOutlined,
  SearchOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadProps } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApiFetch } from '@/lib/api';

interface Translation {
  id: string;
  entityType: string;
  apiId: number;
  sport: string;
  nameEn: string;
  nameZhTw: string;
  shortName: string | null;
  nickname: string | null;
  verified: boolean;
  source: string;
  logo: string | null;
  suspicious: string | null; // 可疑原因（後端計算）
  updatedAt: string;
}

interface ListResponse {
  data: {
    items: Translation[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

interface StatsResponse {
  data: {
    total: number;
    verified: number;
    suspicious: number;
    byType: Array<{ type: string; count: number }>;
    bySource: Array<{ source: string; count: number }>;
  };
}

const ENTITY_TYPE_LABEL: Record<string, string> = {
  team: '球隊',
  player: '球員',
  league: '聯賽',
  coach: '教練',
  venue: '場館',
  country: '國家',
  freetext: '自由文字',
};

const SPORT_LABEL: Record<string, string> = {
  baseball: '棒球',
  basketball: '籃球',
  football: '足球',
  text: '文字',
};

export function CorrectionTab() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [entityType, setEntityType] = useState<string>('all');
  const [sport, setSport] = useState<string>('baseball');
  const [verified, setVerified] = useState<string>('all');
  const [suspicious, setSuspicious] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [editing, setEditing] = useState<Translation | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [form] = Form.useForm();

  // 列表查詢
  const { data: listData, isLoading } = useQuery({
    queryKey: ['translations', page, pageSize, entityType, sport, verified, suspicious, search],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (entityType !== 'all') params.set('entityType', entityType);
      if (sport !== 'all') params.set('sport', sport);
      if (verified !== 'all') params.set('verified', verified);
      if (suspicious === 'true') params.set('suspicious', 'true');
      if (search) params.set('search', search);
      return adminApiFetch<ListResponse>(`/admin/translations?${params}`);
    },
    staleTime: 30 * 1000,
  });

  // 統計
  const { data: statsData } = useQuery({
    queryKey: ['translations-stats'],
    queryFn: () => adminApiFetch<StatsResponse>('/admin/translations/stats'),
    staleTime: 60 * 1000,
  });

  // 更新
  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: any }) =>
      adminApiFetch(`/admin/translations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      message.success('已更新');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['translations'] });
      qc.invalidateQueries({ queryKey: ['translations-stats'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  // 批次校正
  const bulkVerifyMutation = useMutation({
    mutationFn: (ids: string[]) =>
      adminApiFetch<{ data: { updated: number } }>('/admin/translations/bulk-verify', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (res) => {
      message.success(`已標記 ${res.data.updated} 筆為已校正`);
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ['translations'] });
      qc.invalidateQueries({ queryKey: ['translations-stats'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  // 刪除
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      adminApiFetch(`/admin/translations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('已刪除（下次 Cron 會重翻）');
      qc.invalidateQueries({ queryKey: ['translations'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  // 重新翻譯
  const retranslateMutation = useMutation({
    mutationFn: (id: string) =>
      adminApiFetch(`/admin/translations/${id}/retranslate`, { method: 'POST' }),
    onSuccess: () => {
      message.success('已重新翻譯');
      qc.invalidateQueries({ queryKey: ['translations'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  // CSV 匯入
  const importMutation = useMutation({
    mutationFn: (csv: string) =>
      adminApiFetch<{ data: { updated: number; errors: number } }>(
        '/admin/translations/import/csv',
        {
          method: 'POST',
          body: JSON.stringify({ csv }),
        },
      ),
    onSuccess: (res) => {
      message.success(`已更新 ${res.data.updated} 筆，錯誤 ${res.data.errors} 筆`);
      qc.invalidateQueries({ queryKey: ['translations'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const openEdit = (t: Translation) => {
    setEditing(t);
    form.setFieldsValue({
      nameZhTw: t.nameZhTw,
      shortName: t.shortName,
      nickname: t.nickname,
      verified: t.verified,
    });
  };

  const handleSave = () => {
    form.validateFields().then((v) => {
      if (!editing) return;
      updateMutation.mutate({ id: editing.id, values: v });
    });
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (entityType !== 'all') params.set('entityType', entityType);
    if (sport !== 'all') params.set('sport', sport);
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('admin_accessToken') : null;
    if (!token) {
      message.error('未登入');
      return;
    }
    const url = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/admin/translations/export/csv?${params}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `translations-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  const uploadProps: UploadProps = {
    accept: '.csv',
    beforeUpload: (file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const csv = e.target?.result as string;
        importMutation.mutate(csv);
      };
      reader.readAsText(file, 'UTF-8');
      return false;
    },
    showUploadList: false,
  };

  const columns: ColumnsType<Translation> = [
    {
      title: '類型',
      dataIndex: 'entityType',
      key: 'entityType',
      width: 70,
      render: (v) => <Tag>{ENTITY_TYPE_LABEL[v] ?? v}</Tag>,
    },
    {
      title: 'API ID',
      dataIndex: 'apiId',
      key: 'apiId',
      width: 70,
    },
    {
      title: '英文名',
      dataIndex: 'nameEn',
      key: 'nameEn',
      width: 200,
    },
    {
      title: '中文名',
      dataIndex: 'nameZhTw',
      key: 'nameZhTw',
      width: 130,
      render: (v, r) => (
        <Space>
          <span style={{ fontWeight: 500 }}>{v}</span>
          {r.suspicious && (
            <Tag color="warning" icon={<WarningOutlined />} title={r.suspicious}>
              可疑
            </Tag>
          )}
        </Space>
      ),
    },
    { title: '簡稱', dataIndex: 'shortName', key: 'shortName', width: 80 },
    { title: '暱稱', dataIndex: 'nickname', key: 'nickname', width: 80 },
    {
      title: '狀態',
      key: 'status',
      width: 110,
      render: (_, r) => (
        <Space size={4}>
          {r.verified ? (
            <Tag color="success">✔ 已校正</Tag>
          ) : (
            <Tag color="default">○ 未校正</Tag>
          )}
          {r.source === 'ai' && <Tag>AI</Tag>}
          {r.source === 'manual' && <Tag color="blue">手動</Tag>}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 170,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
            編輯
          </Button>
          <Popconfirm title="重新呼叫 Claude 翻譯？" onConfirm={() => retranslateMutation.mutate(r.id)}>
            <Button size="small" icon={<ReloadOutlined />} loading={retranslateMutation.isPending}>
              重翻
            </Button>
          </Popconfirm>
          <Popconfirm title="刪除後下次 Cron 會重翻" onConfirm={() => deleteMutation.mutate(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const stats = statsData?.data;

  return (
    <>
      {/* 統計卡片 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic title="總翻譯數" value={stats?.total ?? 0} />
          </Col>
          <Col span={6}>
            <Statistic
              title="已校正"
              value={stats?.verified ?? 0}
              suffix={`/ ${stats?.total ?? 0}`}
              valueStyle={{ color: '#3f8600' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="可疑翻譯"
              value={stats?.suspicious ?? 0}
              valueStyle={{ color: (stats?.suspicious ?? 0) > 0 ? '#ff4d4f' : '#8c8c8c' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="AI 翻譯"
              value={stats?.bySource.find((b) => b.source === 'ai')?.count ?? 0}
              suffix="筆"
            />
          </Col>
        </Row>
      </Card>

      {/* 篩選 */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            value={entityType}
            onChange={(v) => {
              setEntityType(v);
              setPage(1);
            }}
            style={{ width: 110 }}
            options={[
              { value: 'all', label: '全部類型' },
              { value: 'team', label: '球隊' },
              { value: 'player', label: '球員' },
              { value: 'league', label: '聯賽' },
              { value: 'coach', label: '教練' },
              { value: 'venue', label: '場館' },
            ]}
          />
          <Select
            value={sport}
            onChange={(v) => {
              setSport(v);
              setPage(1);
            }}
            style={{ width: 100 }}
            options={[
              { value: 'all', label: '全部運動' },
              { value: 'baseball', label: '棒球' },
              { value: 'basketball', label: '籃球' },
              { value: 'football', label: '足球' },
            ]}
          />
          <Select
            value={verified}
            onChange={(v) => {
              setVerified(v);
              setPage(1);
            }}
            style={{ width: 110 }}
            options={[
              { value: 'all', label: '全部狀態' },
              { value: 'true', label: '✔ 已校正' },
              { value: 'false', label: '○ 未校正' },
            ]}
          />
          <Select
            value={suspicious}
            onChange={(v) => {
              setSuspicious(v);
              setPage(1);
            }}
            style={{ width: 120 }}
            options={[
              { value: 'all', label: '全部' },
              { value: 'true', label: '⚠️ 只看可疑' },
            ]}
          />
          <Input
            placeholder="搜尋英文名 / 中文名"
            prefix={<SearchOutlined />}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onPressEnter={() => {
              setSearch(searchInput);
              setPage(1);
            }}
            style={{ width: 220 }}
          />
          <Button
            onClick={() => {
              setSearch(searchInput);
              setPage(1);
            }}
          >
            搜尋
          </Button>

          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            匯出 CSV
          </Button>
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />} loading={importMutation.isPending}>
              匯入 CSV
            </Button>
          </Upload>
        </Space>
      </Card>

      {/* 批次操作 */}
      {selectedIds.length > 0 && (
        <Alert
          message={`已選 ${selectedIds.length} 筆`}
          type="info"
          style={{ marginBottom: 16 }}
          action={
            <Space>
              <Button
                type="primary"
                size="small"
                onClick={() => bulkVerifyMutation.mutate(selectedIds)}
                loading={bulkVerifyMutation.isPending}
              >
                批次標記已校正
              </Button>
              <Button size="small" onClick={() => setSelectedIds([])}>
                取消選取
              </Button>
            </Space>
          }
        />
      )}

      {/* 表格 */}
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={listData?.data.items}
          loading={isLoading}
          size="small"
          scroll={{ x: 1000 }}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys as string[]),
          }}
          pagination={{
            current: page,
            pageSize,
            total: listData?.data.total ?? 0,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 筆`,
          }}
        />
      </Card>

      {/* 編輯 Modal */}
      <Modal
        title={
          editing ? (
            <Space>
              <Tag>{ENTITY_TYPE_LABEL[editing.entityType] ?? editing.entityType}</Tag>
              <span>{editing.nameEn}</span>
            </Space>
          ) : (
            '編輯翻譯'
          )
        }
        open={!!editing}
        onOk={handleSave}
        onCancel={() => setEditing(null)}
        confirmLoading={updateMutation.isPending}
        okText="儲存"
        cancelText="取消"
      >
        {editing?.suspicious && (
          <Alert
            type="warning"
            message={`此翻譯被標記為可疑：${editing.suspicious}`}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form form={form} layout="vertical">
          <Form.Item label="中文全名" name="nameZhTw" rules={[{ required: true, message: '必填' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="簡稱" name="shortName">
            <Input placeholder="例：洋基、貝茲" />
          </Form.Item>
          <Form.Item label="暱稱" name="nickname">
            <Input placeholder="例：二刀流、小葛雷諾" />
          </Form.Item>
          <Form.Item name="verified" valuePropName="checked">
            <Checkbox>標記為已校正</Checkbox>
          </Form.Item>
          <div style={{ fontSize: 12, color: '#999' }}>
            來源：{editing?.source === 'ai' ? 'AI（Claude）' : '人工'} · 上次更新：
            {editing?.updatedAt && new Date(editing.updatedAt).toLocaleString('zh-TW')}
          </div>
        </Form>
      </Modal>
    </>
  );
}
