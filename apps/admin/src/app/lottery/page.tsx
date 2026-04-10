'use client';

import React, { useState } from 'react';
import {
  Table,
  Button,
  Select,
  Tag,
  Space,
  message,
  Typography,
} from 'antd';
import { SyncOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { adminApiFetch } from '@/lib/api';

const { Text } = Typography;

const GAME_OPTIONS = [
  { value: 'LOTTO649', label: '大樂透' },
  { value: 'SUPER_LOTTO', label: '威力彩' },
  { value: 'DAILY539', label: '今彩539' },
  { value: 'LOTTO1224', label: '雙贏彩' },
  { value: 'LOTTO3D', label: '3星彩' },
  { value: 'LOTTO4D', label: '4星彩' },
];

interface LotteryResult {
  id: string;
  gameType: string;
  gameName: string;
  period: string;
  drawDate: string;
  numbers: number[];
  specialNum: number[] | null;
  jackpot: string | null;
  totalSales: string | null;
  createdAt: string;
}

interface ResultsResponse {
  data: {
    items: LotteryResult[];
    total: number;
    page: number;
    limit: number;
  };
}

export default function LotteryAdminPage() {
  const queryClient = useQueryClient();
  const [gameType, setGameType] = useState('LOTTO649');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-lottery', gameType, page],
    queryFn: () =>
      adminApiFetch<ResultsResponse>(`/lottery/results?gameType=${gameType}&page=${page}&limit=20`),
  });

  const syncMutation = useMutation({
    mutationFn: (gt?: string) =>
      adminApiFetch(`/lottery/sync${gt ? `?gameType=${gt}` : ''}`, { method: 'POST' }),
    onSuccess: () => {
      message.success('同步完成');
      queryClient.invalidateQueries({ queryKey: ['admin-lottery'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const columns: ColumnsType<LotteryResult> = [
    {
      title: '彩種',
      dataIndex: 'gameName',
      key: 'gameName',
      width: 100,
      render: (name: string) => <Tag color="blue">{name}</Tag>,
    },
    {
      title: '期號',
      dataIndex: 'period',
      key: 'period',
      width: 120,
    },
    {
      title: '開獎日期',
      dataIndex: 'drawDate',
      key: 'drawDate',
      width: 120,
      render: (date: string) => new Date(date).toLocaleDateString('zh-TW'),
    },
    {
      title: '開獎號碼',
      key: 'numbers',
      render: (_, record) => (
        <Space size={4}>
          {record.numbers.map((n, i) => (
            <Tag key={i} color="geekblue" style={{ margin: 0, borderRadius: 20, minWidth: 28, textAlign: 'center' }}>
              {String(n).padStart(2, '0')}
            </Tag>
          ))}
          {record.specialNum?.map((n, i) => (
            <Tag key={`s-${i}`} color="red" style={{ margin: 0, borderRadius: 20, minWidth: 28, textAlign: 'center' }}>
              {String(n).padStart(2, '0')}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '頭獎獎金',
      dataIndex: 'jackpot',
      key: 'jackpot',
      width: 150,
      render: (val: string | null) =>
        val ? <Text strong style={{ color: '#cf1322' }}>NT$ {Number(val).toLocaleString()}</Text> : '—',
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Space>
          <ThunderboltOutlined style={{ color: '#faad14' }} />
          <span style={{ fontWeight: 500, fontSize: 16 }}>彩券開獎管理</span>
        </Space>
        <Space>
          <Select
            value={gameType}
            onChange={(v) => { setGameType(v); setPage(1); }}
            options={GAME_OPTIONS}
            style={{ width: 130 }}
          />
          <Button
            icon={<SyncOutlined />}
            onClick={() => syncMutation.mutate(gameType)}
            loading={syncMutation.isPending}
          >
            同步此彩種
          </Button>
          <Button
            type="primary"
            icon={<SyncOutlined />}
            onClick={() => syncMutation.mutate(undefined)}
            loading={syncMutation.isPending}
          >
            同步全部
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={data?.data.items}
        rowKey="id"
        loading={isLoading}
        pagination={{
          current: page,
          pageSize: 20,
          total: data?.data.total ?? 0,
          onChange: setPage,
          showTotal: (total) => `共 ${total} 筆`,
        }}
        size="middle"
        locale={{ emptyText: '尚無開獎資料，請點擊「同步」抓取' }}
        scroll={{ x: 800 }}
      />
    </div>
  );
}
