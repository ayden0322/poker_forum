'use client';

import React, { useState } from 'react';
import {
  Table,
  Button,
  Input,
  Modal,
  message,
  Typography,
  Space,
  Tag,
  Popconfirm,
} from 'antd';
import { PlusOutlined, DeleteOutlined, StopOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { adminApiFetch } from '@/lib/api';

const { Text } = Typography;

interface BannedIp {
  id: string;
  ip: string;
  reason: string | null;
  createdAt: string;
}

interface BannedIpsResponse {
  data: BannedIp[];
}

export default function BannedIpsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [newReason, setNewReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-banned-ips'],
    queryFn: () => adminApiFetch<BannedIpsResponse>('/admin/banned-ips'),
  });

  const addMutation = useMutation({
    mutationFn: ({ ip, reason }: { ip: string; reason?: string }) =>
      adminApiFetch('/admin/banned-ips', {
        method: 'POST',
        body: JSON.stringify({ ip, reason }),
      }),
    onSuccess: () => {
      message.success('IP 已封鎖');
      setAddOpen(false);
      setNewIp('');
      setNewReason('');
      queryClient.invalidateQueries({ queryKey: ['admin-banned-ips'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      adminApiFetch(`/admin/banned-ips/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('已解除封鎖');
      queryClient.invalidateQueries({ queryKey: ['admin-banned-ips'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const columns: ColumnsType<BannedIp> = [
    {
      title: 'IP 位址',
      dataIndex: 'ip',
      key: 'ip',
      render: (ip: string) => <Text code>{ip}</Text>,
    },
    {
      title: '封鎖原因',
      dataIndex: 'reason',
      key: 'reason',
      render: (reason: string | null) => reason ?? <Text type="secondary">—</Text>,
    },
    {
      title: '封鎖時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: string) => new Date(date).toLocaleString('zh-TW'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 110,
      render: (_, record) => (
        <Popconfirm
          title="確定要解除封鎖此 IP？"
          onConfirm={() => removeMutation.mutate(record.id)}
          okText="解除封鎖"
          cancelText="取消"
          okButtonProps={{ danger: false }}
        >
          <Button
            size="small"
            icon={<DeleteOutlined />}
            loading={removeMutation.isPending}
          >
            解除封鎖
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const handleAdd = () => {
    const trimmed = newIp.trim();
    if (!trimmed) {
      message.warning('請輸入 IP 位址');
      return;
    }
    addMutation.mutate({ ip: trimmed, reason: newReason.trim() || undefined });
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <StopOutlined style={{ color: '#ff4d4f' }} />
          <span style={{ fontWeight: 500 }}>封鎖 IP 列表</span>
          <Tag color="error">{data?.data.length ?? 0} 個封鎖中</Tag>
        </Space>
        <Button
          type="primary"
          danger
          icon={<PlusOutlined />}
          onClick={() => setAddOpen(true)}
        >
          新增封鎖 IP
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={data?.data}
        rowKey="id"
        loading={isLoading}
        pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 個` }}
        size="middle"
        locale={{ emptyText: '目前沒有封鎖的 IP' }}
        scroll={{ x: 600 }}
      />

      <Modal
        title="新增封鎖 IP"
        open={addOpen}
        onOk={handleAdd}
        onCancel={() => { setAddOpen(false); setNewIp(''); setNewReason(''); }}
        confirmLoading={addMutation.isPending}
        okText="封鎖"
        okButtonProps={{ danger: true }}
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>IP 位址 *</label>
            <Input
              placeholder="例如：192.168.1.100"
              value={newIp}
              onChange={(e) => setNewIp(e.target.value)}
              onPressEnter={handleAdd}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>封鎖原因（選填）</label>
            <Input.TextArea
              rows={2}
              placeholder="例如：濫用、廣告灌水..."
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
