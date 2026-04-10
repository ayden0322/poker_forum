'use client';

import React, { useState } from 'react';
import {
  Table,
  Input,
  Select,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  message,
  Avatar,
  Typography,
  Drawer,
  Descriptions,
} from 'antd';
import {
  UserOutlined,
  StopOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  StopFilled,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';

import { adminApiFetch } from '@/lib/api';

const { Text } = Typography;

interface Member {
  id: string;
  nickname: string;
  account: string | null;
  email: string | null;
  avatar: string | null;
  level: number;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  status: 'ACTIVE' | 'BANNED' | 'SUSPENDED';
  lastLoginIp: string | null;
  postCount: number;
  replyCount: number;
  followerCount: number;
  followingCount: number;
  createdAt: string;
}

interface MembersResponse {
  data: {
    items: Member[];
    total: number;
    page: number;
    limit: number;
  };
}

const ROLE_OPTIONS = [
  { value: 'USER', label: '一般會員' },
  { value: 'MODERATOR', label: '版主' },
  { value: 'ADMIN', label: '管理員' },
];

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: '正常' },
  { value: 'SUSPENDED', label: '停權' },
  { value: 'BANNED', label: '封禁' },
];

export default function MembersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [detailMember, setDetailMember] = useState<Member | null>(null);
  const [banIpTarget, setBanIpTarget] = useState<{ ip: string; nickname: string } | null>(null);
  const [banReason, setBanReason] = useState('');
  const [form] = Form.useForm();

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', '20');
  if (search) queryParams.set('q', search);
  if (statusFilter) queryParams.set('status', statusFilter);
  if (roleFilter) queryParams.set('role', roleFilter);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-members', page, search, statusFilter, roleFilter],
    queryFn: () => adminApiFetch<MembersResponse>(`/admin/members?${queryParams}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { role?: string; status?: string } }) =>
      adminApiFetch(`/admin/members/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      message.success('更新成功');
      setEditingMember(null);
      queryClient.invalidateQueries({ queryKey: ['admin-members'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const banIpMutation = useMutation({
    mutationFn: ({ ip, reason }: { ip: string; reason?: string }) =>
      adminApiFetch('/admin/banned-ips', {
        method: 'POST',
        body: JSON.stringify({ ip, reason }),
      }),
    onSuccess: () => {
      message.success('IP 已封鎖');
      setBanIpTarget(null);
      setBanReason('');
    },
    onError: (err: Error) => message.error(err.message),
  });

  const handleEdit = (member: Member) => {
    setEditingMember(member);
    form.setFieldsValue({ role: member.role, status: member.status });
  };

  const handleSave = () => {
    form.validateFields().then((values: { role: string; status: string }) => {
      if (!editingMember) return;
      updateMutation.mutate({ id: editingMember.id, body: values });
    });
  };

  const statusTag = (status: Member['status']) => {
    const map = {
      ACTIVE: { color: 'success', label: '正常' },
      SUSPENDED: { color: 'warning', label: '停權' },
      BANNED: { color: 'error', label: '封禁' },
    };
    const { color, label } = map[status];
    return <Tag color={color}>{label}</Tag>;
  };

  const roleTag = (role: Member['role']) => {
    const map = {
      USER: { color: 'default', label: '一般' },
      MODERATOR: { color: 'blue', label: '版主' },
      ADMIN: { color: 'red', label: '管理員' },
    };
    const { color, label } = map[role];
    return <Tag color={color}>{label}</Tag>;
  };

  const columns: ColumnsType<Member> = [
    {
      title: '會員',
      key: 'member',
      render: (_, record) => (
        <Space>
          <Avatar src={record.avatar} icon={<UserOutlined />} size={32} />
          <div>
            <div style={{ fontWeight: 500 }}>{record.nickname}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{record.account ?? '—'}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (email) => email ?? '—',
    },
    {
      title: '等級',
      dataIndex: 'level',
      key: 'level',
      width: 70,
      render: (level) => `Lv.${level}`,
    },
    {
      title: '發文數',
      dataIndex: 'postCount',
      key: 'postCount',
      width: 80,
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 90,
      render: (role) => roleTag(role),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status) => statusTag(status),
    },
    {
      title: '加入時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (date) => new Date(date).toLocaleDateString('zh-TW'),
    },
    {
      title: '最後登入 IP',
      dataIndex: 'lastLoginIp',
      key: 'lastLoginIp',
      width: 130,
      render: (ip: string | null) => ip ? (
        <Text code style={{ fontSize: 12 }}>{ip}</Text>
      ) : '—',
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailMember(record)}>
            檢視
          </Button>
          <Button size="small" onClick={() => handleEdit(record)}>
            編輯
          </Button>
          {record.lastLoginIp && (
            <Button
              size="small"
              danger
              icon={<StopFilled />}
              onClick={() => setBanIpTarget({ ip: record.lastLoginIp!, nickname: record.nickname })}
            >
              封鎖IP
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Input.Search
          placeholder="搜尋暱稱 / 帳號"
          style={{ width: 220, maxWidth: '100%' }}
          onSearch={(v) => { setSearch(v); setPage(1); }}
          allowClear
          enterButton
        />
        <Select
          placeholder="狀態篩選"
          style={{ width: 130, maxWidth: '100%' }}
          value={statusFilter || undefined}
          onChange={(v) => { setStatusFilter(v ?? ''); setPage(1); }}
          allowClear
          options={STATUS_OPTIONS}
        />
        <Select
          placeholder="角色篩選"
          style={{ width: 130, maxWidth: '100%' }}
          value={roleFilter || undefined}
          onChange={(v) => { setRoleFilter(v ?? ''); setPage(1); }}
          allowClear
          options={ROLE_OPTIONS}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Tag icon={<CheckCircleOutlined />} color="success">正常</Tag>
          <Tag icon={<StopOutlined />} color="warning">停權</Tag>
          <Tag icon={<StopOutlined />} color="error">封禁</Tag>
        </div>
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
          showTotal: (total) => `共 ${total} 位會員`,
        }}
        size="middle"
        scroll={{ x: 800 }}
      />

      {/* 編輯 Modal */}
      <Modal
        title={`編輯會員：${editingMember?.nickname}`}
        open={!!editingMember}
        onOk={handleSave}
        onCancel={() => setEditingMember(null)}
        confirmLoading={updateMutation.isPending}
        okText="儲存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="角色" name="role" rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item label="狀態" name="status" rules={[{ required: true }]}>
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 會員詳情 Drawer */}
      <Drawer
        title={`會員詳情：${detailMember?.nickname}`}
        open={!!detailMember}
        onClose={() => setDetailMember(null)}
        width={440}
        styles={{ wrapper: { maxWidth: '100vw' } }}
      >
        {detailMember && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Avatar src={detailMember.avatar} icon={<UserOutlined />} size={64} />
              <h3 style={{ marginTop: 8, marginBottom: 4 }}>{detailMember.nickname}</h3>
              <Space>
                {roleTag(detailMember.role)}
                {statusTag(detailMember.status)}
              </Space>
            </div>

            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="帳號">{detailMember.account ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Email">{detailMember.email ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="等級">Lv.{detailMember.level}</Descriptions.Item>
              <Descriptions.Item label="發文數">{detailMember.postCount}</Descriptions.Item>
              <Descriptions.Item label="回覆數">{detailMember.replyCount}</Descriptions.Item>
              <Descriptions.Item label="追蹤者">{detailMember.followerCount}</Descriptions.Item>
              <Descriptions.Item label="追蹤中">{detailMember.followingCount}</Descriptions.Item>
              <Descriptions.Item label="最後登入 IP">
                {detailMember.lastLoginIp ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="註冊時間">
                {new Date(detailMember.createdAt).toLocaleString('zh-TW')}
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <Button block onClick={() => { setDetailMember(null); handleEdit(detailMember); }}>
                編輯角色 / 狀態
              </Button>
              {detailMember.lastLoginIp && (
                <Button
                  block
                  danger
                  icon={<StopFilled />}
                  onClick={() => {
                    setDetailMember(null);
                    setBanIpTarget({ ip: detailMember.lastLoginIp!, nickname: detailMember.nickname });
                  }}
                >
                  封鎖此 IP
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* 封鎖 IP Modal */}
      <Modal
        title={`封鎖 IP：${banIpTarget?.ip}`}
        open={!!banIpTarget}
        onOk={() => {
          if (!banIpTarget) return;
          banIpMutation.mutate({ ip: banIpTarget.ip, reason: banReason || undefined });
        }}
        onCancel={() => { setBanIpTarget(null); setBanReason(''); }}
        confirmLoading={banIpMutation.isPending}
        okText="確認封鎖"
        okButtonProps={{ danger: true }}
        cancelText="取消"
      >
        <p>即將封鎖會員 <strong>{banIpTarget?.nickname}</strong> 的最後登入 IP：</p>
        <p><Text code>{banIpTarget?.ip}</Text></p>
        <p style={{ color: '#999', fontSize: 13 }}>封鎖後，此 IP 的所有請求將被拒絕。</p>
        <Input.TextArea
          rows={2}
          placeholder="封鎖原因（選填）"
          value={banReason}
          onChange={(e) => setBanReason(e.target.value)}
          style={{ marginTop: 8 }}
        />
      </Modal>
    </div>
  );
}
