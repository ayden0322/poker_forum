'use client';

/**
 * FIFA 世界盃 2026 — 後台管理
 *
 * 功能：
 * 1. 篩選比賽（狀態 / 組別 / 階段）
 * 2. 點擊任一場 → 編輯比分與狀態
 * 3. 顯示資料源狀態與重新匯入指引
 *
 * 注意：重新匯入賽程須在伺服器端執行 CLI 腳本（避免長任務阻塞 HTTP）：
 *   docker exec betting-forum-api sh -c \
 *     "cd /app && /app/node_modules/.pnpm/node_modules/.bin/tsx apps/api/scripts/seed-world-cup-2026.ts"
 *   加 --dev-mock 會塞測試比分（DEV 限定）
 */

import React, { useMemo, useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  InputNumber,
  Select,
  Alert,
  Typography,
  Statistic,
  Row,
  Col,
  message,
} from 'antd';
import { TrophyOutlined, EditOutlined, FireOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApiFetch } from '@/lib/api';

const { Title, Text } = Typography;

interface TeamView {
  id: number | null;
  fifaCode: string | null;
  nameEn: string;
  nameZh: string;
  flag: string | null;
  isPlaceholder: boolean;
}

interface Match {
  id: number;
  matchNumber: number;
  round: string;
  stage: 'group' | 'knockout';
  group: string | null;
  kickoffAt: string;
  venue: string;
  home: TeamView;
  away: TeamView;
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'live' | 'finished';
  liveMinute: number | null;
}

const STATUS_TAG: Record<Match['status'], { color: string; label: string }> = {
  scheduled: { color: 'blue', label: '尚未開賽' },
  live: { color: 'red', label: 'LIVE' },
  finished: { color: 'default', label: '已結束' },
};

export default function WorldCupAdminPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<{ status?: string; stage?: string; group?: string }>({});
  const [editing, setEditing] = useState<Match | null>(null);
  const [form] = Form.useForm();

  const queryStr = useMemo(() => {
    const sp = new URLSearchParams();
    if (filter.status) sp.set('status', filter.status);
    if (filter.stage) sp.set('stage', filter.stage);
    if (filter.group) sp.set('group', filter.group);
    return sp.toString();
  }, [filter]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-world-cup-matches', queryStr],
    queryFn: () => adminApiFetch<{ data: Match[] }>(`/sports/world-cup/matches${queryStr ? '?' + queryStr : ''}`),
  });

  // 統計用：抓全部，本地分群
  const { data: allData } = useQuery({
    queryKey: ['admin-world-cup-all'],
    queryFn: () => adminApiFetch<{ data: Match[] }>('/sports/world-cup/matches'),
  });

  const stats = useMemo(() => {
    const all = allData?.data ?? [];
    return {
      total: all.length,
      scheduled: all.filter((m) => m.status === 'scheduled').length,
      live: all.filter((m) => m.status === 'live').length,
      finished: all.filter((m) => m.status === 'finished').length,
    };
  }, [allData]);

  const updateMutation = useMutation({
    mutationFn: (payload: { id: number; data: Record<string, unknown> }) =>
      adminApiFetch(`/admin/world-cup/match/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload.data),
      }),
    onSuccess: () => {
      message.success('已更新比分');
      qc.invalidateQueries({ queryKey: ['admin-world-cup-matches'] });
      qc.invalidateQueries({ queryKey: ['admin-world-cup-all'] });
      setEditing(null);
    },
    onError: (e: Error) => message.error(`更新失敗：${e.message}`),
  });

  const openEdit = (m: Match) => {
    setEditing(m);
    form.setFieldsValue({
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
      liveMinute: m.liveMinute,
    });
  };

  const submitEdit = async () => {
    if (!editing) return;
    const values = await form.validateFields();
    updateMutation.mutate({ id: editing.id, data: values });
  };

  const columns = [
    { title: '#', dataIndex: 'matchNumber', width: 60 },
    { title: '階段', dataIndex: 'round', width: 130 },
    {
      title: '組別',
      dataIndex: 'group',
      width: 90,
      render: (g: string | null) => g ?? <Text type="secondary">-</Text>,
    },
    {
      title: '對戰',
      width: 360,
      render: (_: unknown, m: Match) => (
        <Space size="small">
          <span>{m.home.flag} {m.home.nameZh}</span>
          <Text strong style={{ color: m.status === 'live' ? '#f5222d' : undefined }}>
            {m.homeScore ?? '-'} : {m.awayScore ?? '-'}
          </Text>
          <span>{m.away.flag} {m.away.nameZh}</span>
        </Space>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 110,
      render: (s: Match['status'], m: Match) => (
        <Tag color={STATUS_TAG[s].color} icon={s === 'live' ? <FireOutlined /> : undefined}>
          {STATUS_TAG[s].label}
          {s === 'live' && m.liveMinute != null && ` ${m.liveMinute}'`}
        </Tag>
      ),
    },
    {
      title: '開賽時間',
      dataIndex: 'kickoffAt',
      width: 180,
      render: (iso: string) =>
        new Date(iso).toLocaleString('zh-TW', {
          timeZone: 'Asia/Taipei',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
    },
    {
      title: '操作',
      width: 100,
      render: (_: unknown, m: Match) => (
        <Button
          type="link"
          icon={<EditOutlined />}
          onClick={() => openEdit(m)}
          disabled={m.home.isPlaceholder || m.away.isPlaceholder}
        >
          編輯
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Title level={3}>
        <TrophyOutlined /> FIFA 世界盃 2026 管理
      </Title>

      <Alert
        type="info"
        showIcon
        message="資料源：GitHub openfootball/worldcup.json（公開、免費）"
        description={
          <div>
            <div>升級 API-Sports 後可改為自動同步即時比分。目前可在此手動更新比分。</div>
            <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}>
              重新匯入 CLI：<code>tsx apps/api/scripts/seed-world-cup-2026.ts</code>（加 <code>--dev-mock</code> 會塞測試比分）
            </div>
          </div>
        }
        style={{ marginBottom: 16 }}
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="總場次" value={stats.total} suffix="/ 104" /></Card></Col>
        <Col span={6}><Card><Statistic title="尚未開賽" value={stats.scheduled} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="進行中" value={stats.live} valueStyle={{ color: '#f5222d' }} prefix={<FireOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="已結束" value={stats.finished} valueStyle={{ color: '#666' }} /></Card></Col>
      </Row>

      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <span>篩選：</span>
          <Select
            placeholder="狀態"
            allowClear
            style={{ width: 130 }}
            onChange={(v) => setFilter((f) => ({ ...f, status: v }))}
            options={[
              { value: 'scheduled', label: '尚未開賽' },
              { value: 'live', label: '進行中' },
              { value: 'finished', label: '已結束' },
            ]}
          />
          <Select
            placeholder="階段"
            allowClear
            style={{ width: 130 }}
            onChange={(v) => setFilter((f) => ({ ...f, stage: v }))}
            options={[
              { value: 'group', label: '小組賽' },
              { value: 'knockout', label: '淘汰賽' },
            ]}
          />
          <Select
            placeholder="組別"
            allowClear
            style={{ width: 100 }}
            onChange={(v) => setFilter((f) => ({ ...f, group: v }))}
            options={['A','B','C','D','E','F','G','H','I','J','K','L'].map((g) => ({ value: g, label: `Group ${g}` }))}
          />
        </Space>

        <Table
          rowKey="id"
          dataSource={data?.data ?? []}
          columns={columns}
          loading={isLoading}
          pagination={{ pageSize: 20 }}
          size="small"
        />
      </Card>

      <Modal
        title={
          editing
            ? `編輯第 ${editing.matchNumber} 場：${editing.home.nameZh} vs ${editing.away.nameZh}`
            : '編輯比分'
        }
        open={!!editing}
        onOk={submitEdit}
        onCancel={() => setEditing(null)}
        confirmLoading={updateMutation.isPending}
        okText="儲存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label={`${editing?.home.flag ?? ''} ${editing?.home.nameZh ?? '主隊'}`} name="homeScore">
                <InputNumber min={0} max={20} style={{ width: '100%' }} placeholder="比分" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={`${editing?.away.flag ?? ''} ${editing?.away.nameZh ?? '客隊'}`} name="awayScore">
                <InputNumber min={0} max={20} style={{ width: '100%' }} placeholder="比分" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="狀態" name="status" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'scheduled', label: '尚未開賽' },
                    { value: 'live', label: '進行中 LIVE' },
                    { value: 'finished', label: '已結束' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="進行分鐘（live 時填）" name="liveMinute">
            <InputNumber min={0} max={130} style={{ width: '100%' }} placeholder="例：67" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
