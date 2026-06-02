'use client';

import React from 'react';
import { Table, Switch, Tag, message, Alert, Typography } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { SettingOutlined } from '@ant-design/icons';

import { adminApiFetch } from '@/lib/api';

interface PagePermission {
  key: string;
  label: string;
  allowModerator: boolean;
  allowAdmin: boolean;
  allowSuperAdmin: boolean;
  alwaysSuperAdmin: boolean;
}

interface PermissionsResponse {
  data: PagePermission[];
}

type Tier = 'allowModerator' | 'allowAdmin' | 'allowSuperAdmin';

export default function PermissionsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-permissions'],
    queryFn: () => adminApiFetch<PermissionsResponse>('/admin/permissions'),
  });

  const mutation = useMutation({
    mutationFn: ({ pageKey, body }: { pageKey: string; body: Partial<Record<Tier, boolean>> }) =>
      adminApiFetch(`/admin/permissions/${pageKey}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      message.success('已更新權限');
      // 同步刷新自己的可見選單（若改到自己的層級會即時反映）
      queryClient.invalidateQueries({ queryKey: ['admin-permissions'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const toggle = (record: PagePermission, tier: Tier, value: boolean) =>
    mutation.mutate({ pageKey: record.key, body: { [tier]: value } });

  const tierColumn = (
    title: string,
    tier: Tier,
    color: string,
  ): ColumnsType<PagePermission>[number] => ({
    title: <Tag color={color}>{title}</Tag>,
    key: tier,
    width: 130,
    align: 'center' as const,
    render: (_, record) => {
      // 權限設定頁本身對超級管理員永遠開放（防鎖死），該格鎖定不可關
      const locked = record.alwaysSuperAdmin && tier === 'allowSuperAdmin';
      return (
        <Switch
          checked={record[tier]}
          disabled={locked || mutation.isPending}
          onChange={(v) => toggle(record, tier, v)}
        />
      );
    },
  });

  const columns: ColumnsType<PagePermission> = [
    {
      title: '頁面',
      dataIndex: 'label',
      key: 'label',
      render: (label, record) => (
        <span>
          {label}
          {record.alwaysSuperAdmin && (
            <Tag color="gold" style={{ marginLeft: 8 }}>
              永遠開放超管
            </Tag>
          )}
        </span>
      ),
    },
    tierColumn('編輯人員', 'allowModerator', 'blue'),
    tierColumn('總管理員', 'allowAdmin', 'red'),
    tierColumn('超級管理員', 'allowSuperAdmin', 'volcano'),
  ];

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
        <SettingOutlined style={{ marginRight: 8 }} />
        權限設定
      </h2>
      <Typography.Paragraph type="secondary" style={{ marginTop: 6, fontSize: 13 }}>
        勾選每個頁面對各層級的可見性。關閉後該層級在側欄看不到、也無法直接呼叫對應 API。
      </Typography.Paragraph>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="可逆設計"
        description="你可以把某頁對「超級管理員」也關掉（例如把彩券對自己隱藏）。但「權限設定」這頁本身永遠對超級管理員開放，所以你隨時能回來重新打開，不會把自己鎖死。"
      />

      <Table
        columns={columns}
        dataSource={data?.data}
        rowKey="key"
        loading={isLoading}
        pagination={false}
        size="middle"
      />
    </div>
  );
}
