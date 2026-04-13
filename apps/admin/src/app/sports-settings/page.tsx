'use client';

import React, { useState } from 'react';
import {
  Card,
  Table,
  Switch,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Space,
  Tag,
  Typography,
  Divider,
  Descriptions,
  Statistic,
  message,
  Popconfirm,
  Row,
  Col,
} from 'antd';
import { ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApiFetch } from '@/lib/api';

const { Title, Text } = Typography;

interface SportsConfig {
  id: string;
  sportType: string;
  displayName: string;
  enabled: boolean;
  apiHost: string;
  leagueId: number;
  season: string;
  cacheTtl: Record<string, number>;
  extraConfig: Record<string, unknown> | null;
  updatedBy: string | null;
  updatedAt: string;
}

interface ApiUsageInfo {
  account?: { firstname: string; lastname: string; email: string };
  subscription?: { plan: string; end: string; active: boolean };
  requests?: { current: number; limit_day: number };
}

export default function SportsSettingsPage() {
  const qc = useQueryClient();
  const [editModal, setEditModal] = useState<SportsConfig | null>(null);
  const [form] = Form.useForm();

  // 取得所有設定
  const { data, isLoading } = useQuery({
    queryKey: ['admin-sports-config'],
    queryFn: () => adminApiFetch<{ data: SportsConfig[] }>('/admin/sports-config'),
    staleTime: 30 * 1000,
  });

  // 取得 API 使用量
  const { data: usageData, isLoading: usageLoading, refetch: refetchUsage } = useQuery({
    queryKey: ['admin-sports-usage'],
    queryFn: () => adminApiFetch<{ data: Record<string, ApiUsageInfo> }>('/admin/sports-config/usage'),
    staleTime: 60 * 1000,
  });

  // 更新設定
  const updateMutation = useMutation({
    mutationFn: ({ sportType, values }: { sportType: string; values: Record<string, unknown> }) =>
      adminApiFetch(`/admin/sports-config/${sportType}`, {
        method: 'PUT',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      message.success('設定已更新');
      qc.invalidateQueries({ queryKey: ['admin-sports-config'] });
      setEditModal(null);
    },
    onError: (e: Error) => message.error(e.message),
  });

  // 啟用/停用切換
  const toggleMutation = useMutation({
    mutationFn: ({ sportType, enabled }: { sportType: string; enabled: boolean }) =>
      adminApiFetch(`/admin/sports-config/${sportType}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-sports-config'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  // 重置為預設
  const seedMutation = useMutation({
    mutationFn: () => adminApiFetch('/admin/sports-config/seed', { method: 'POST' }),
    onSuccess: () => {
      message.success('已重置為預設設定');
      qc.invalidateQueries({ queryKey: ['admin-sports-config'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const configs = data?.data ?? [];
  const usage = usageData?.data ?? {};

  const openEdit = (record: SportsConfig) => {
    setEditModal(record);
    form.setFieldsValue({
      displayName: record.displayName,
      apiHost: record.apiHost,
      leagueId: record.leagueId,
      season: record.season,
      cacheLive: record.cacheTtl?.live ?? 60,
      cacheSchedule: record.cacheTtl?.schedule ?? 300,
      cacheStandings: record.cacheTtl?.standings ?? 600,
      cachePlayers: record.cacheTtl?.players ?? 3600,
      cacheOdds: record.cacheTtl?.odds ?? 120,
    });
  };

  const handleSave = () => {
    form.validateFields().then((values) => {
      if (!editModal) return;
      const payload = {
        displayName: values.displayName,
        apiHost: values.apiHost,
        leagueId: values.leagueId,
        season: values.season,
        cacheTtl: {
          live: values.cacheLive,
          schedule: values.cacheSchedule,
          standings: values.cacheStandings,
          players: values.cachePlayers,
          odds: values.cacheOdds,
        },
      };
      updateMutation.mutate({ sportType: editModal.sportType, values: payload });
    });
  };

  const columns = [
    {
      title: '運動',
      dataIndex: 'displayName',
      key: 'displayName',
      render: (name: string, record: SportsConfig) => (
        <Space>
          <Text strong>{name}</Text>
          <Tag>{record.sportType}</Tag>
        </Space>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean, record: SportsConfig) => (
        <Switch
          checked={enabled}
          onChange={(checked) => toggleMutation.mutate({ sportType: record.sportType, enabled: checked })}
          loading={toggleMutation.isPending}
        />
      ),
    },
    {
      title: 'API Host',
      dataIndex: 'apiHost',
      key: 'apiHost',
      render: (host: string) => <Text code style={{ fontSize: 12 }}>{host}</Text>,
    },
    {
      title: '聯賽 ID',
      dataIndex: 'leagueId',
      key: 'leagueId',
      width: 80,
    },
    {
      title: '賽季',
      dataIndex: 'season',
      key: 'season',
      width: 100,
    },
    {
      title: '今日用量',
      key: 'usage',
      width: 120,
      render: (_: unknown, record: SportsConfig) => {
        const info = usage[record.sportType] as ApiUsageInfo | undefined;
        if (!info?.requests) return <Text type="secondary">-</Text>;
        const pct = Math.round((info.requests.current / info.requests.limit_day) * 100);
        const color = pct > 80 ? 'red' : pct > 50 ? 'orange' : 'green';
        return (
          <Tag color={color}>
            {info.requests.current} / {info.requests.limit_day}
          </Tag>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: SportsConfig) => (
        <Button
          type="link"
          size="small"
          icon={<SettingOutlined />}
          onClick={() => openEdit(record)}
        >
          設定
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card
        loading={isLoading}
        title={<Title level={4} style={{ margin: 0 }}>運彩 API 設定</Title>}
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => refetchUsage()}
              loading={usageLoading}
            >
              刷新用量
            </Button>
            <Popconfirm
              title="確定要重置所有設定？"
              description="將還原為預設值（不影響 API Key）"
              onConfirm={() => seedMutation.mutate()}
            >
              <Button loading={seedMutation.isPending}>重置預設</Button>
            </Popconfirm>
          </Space>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          管理體育賽事 API 串接設定。所有 API 共用同一把 API Key（在環境變數 API_SPORTS_KEY 中設定）。
        </Text>

        {/* API 使用量概覽 */}
        {Object.keys(usage).length > 0 && (
          <>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              {configs.filter((c) => c.enabled).map((c) => {
                const info = usage[c.sportType] as ApiUsageInfo | undefined;
                return (
                  <Col key={c.sportType} span={8}>
                    <Card size="small">
                      <Statistic
                        title={c.displayName}
                        value={info?.requests?.current ?? 0}
                        suffix={`/ ${info?.requests?.limit_day ?? '?'}`}
                        valueStyle={{
                          fontSize: 20,
                          color: info?.requests && info.requests.current / info.requests.limit_day > 0.8
                            ? '#ff4d4f'
                            : '#3f8600',
                        }}
                      />
                      {info?.subscription && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          方案：{info.subscription.plan} ｜
                          到期：{info.subscription.end}
                        </Text>
                      )}
                    </Card>
                  </Col>
                );
              })}
            </Row>
            <Divider />
          </>
        )}

        <Table
          dataSource={configs}
          columns={columns}
          rowKey="id"
          pagination={false}
          scroll={{ x: 700 }}
        />
      </Card>

      {/* 編輯 Modal */}
      <Modal
        title={`設定 - ${editModal?.displayName ?? ''}`}
        open={!!editModal}
        onOk={handleSave}
        onCancel={() => setEditModal(null)}
        confirmLoading={updateMutation.isPending}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="顯示名稱" name="displayName" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item label="API Host" name="apiHost" rules={[{ required: true }]}>
            <Input placeholder="v3.football.api-sports.io" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="聯賽 ID" name="leagueId" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="賽季" name="season" rules={[{ required: true }]}>
                <Input placeholder="2026 或 2025-2026" />
              </Form.Item>
            </Col>
          </Row>

          <Divider>快取設定（秒）</Divider>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="即時比分" name="cacheLive">
                <InputNumber style={{ width: '100%' }} min={10} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="賽程" name="cacheSchedule">
                <InputNumber style={{ width: '100%' }} min={60} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="排名" name="cacheStandings">
                <InputNumber style={{ width: '100%' }} min={60} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="球員數據" name="cachePlayers">
                <InputNumber style={{ width: '100%' }} min={60} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="賠率" name="cacheOdds">
                <InputNumber style={{ width: '100%' }} min={10} />
              </Form.Item>
            </Col>
          </Row>

          {editModal && (
            <>
              <Divider />
              <Descriptions size="small" column={1}>
                <Descriptions.Item label="最後更新">
                  {new Date(editModal.updatedAt).toLocaleString()}
                </Descriptions.Item>
              </Descriptions>
            </>
          )}
        </Form>
      </Modal>
    </>
  );
}
