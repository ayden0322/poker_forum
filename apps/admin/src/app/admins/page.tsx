'use client';

import React, { useState } from 'react';
import {
  Table,
  Tag,
  Select,
  Button,
  Input,
  Space,
  Modal,
  message,
  Popconfirm,
  Typography,
  Empty,
} from 'antd';
import { SafetyCertificateOutlined, KeyOutlined, UserAddOutlined, SettingOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';

import { adminApiFetch } from '@/lib/api';
import { useAdminAuth } from '@/context/auth';
import { ROLE_LABEL, ROLE_RANK, rankOf, type AdminRole } from '@/lib/roles';
import { AdminPermissionDrawer } from '@/components/AdminPermissionDrawer';

interface MemberItem {
  id: string;
  nickname: string;
  account: string | null;
  role: AdminRole;
  status: 'ACTIVE' | 'BANNED' | 'SUSPENDED';
  avatar: string | null;
  lastLoginAt: string | null;
}

interface MembersResponse {
  data: { items: MemberItem[]; total: number; page: number; limit: number };
}

const roleColor = (role: string) =>
  role === 'SUPER_ADMIN' ? 'volcano' : role === 'ADMIN' ? 'red' : role === 'MODERATOR' ? 'blue' : 'default';

export default function AdminsPage() {
  const queryClient = useQueryClient();
  const { user } = useAdminAuth();
  const actorRank = rankOf(user?.role);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  // 目前登入者「能指派」的層級：嚴格低於自己（含降為一般會員）
  const assignableRoles = (['ADMIN', 'MODERATOR', 'USER'] as AdminRole[]).filter(
    (r) => ROLE_RANK[r] < actorRank,
  );

  const { data, isLoading } = useQuery({
    queryKey: ['admin-admins', page, search],
    queryFn: () =>
      adminApiFetch<MembersResponse>(
        `/admin/members?tier=admin&page=${page}&limit=20${search ? `&q=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: AdminRole }) =>
      adminApiFetch(`/admin/members/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      message.success('已更新層級');
      queryClient.invalidateQueries({ queryKey: ['admin-admins'] });
      queryClient.invalidateQueries({ queryKey: ['admin-members'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  // ===== 權限編輯 =====
  const [permTarget, setPermTarget] = useState<MemberItem | null>(null);

  // ===== 重設密碼 =====
  const [pwTarget, setPwTarget] = useState<MemberItem | null>(null);
  const [pwValue, setPwValue] = useState('');
  const pwMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      adminApiFetch(`/admin/members/${id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password }),
      }),
    onSuccess: () => {
      message.success('密碼已重設');
      setPwTarget(null);
      setPwValue('');
    },
    onError: (err: Error) => message.error(err.message),
  });

  // ===== 新增管理員（把一般會員升上來） =====
  const [addOpen, setAddOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateQuery, setCandidateQuery] = useState('');
  const { data: candidates, isFetching: candidateLoading } = useQuery({
    queryKey: ['admin-add-candidates', candidateQuery],
    queryFn: () =>
      adminApiFetch<MembersResponse>(
        `/admin/members?tier=user&limit=10&q=${encodeURIComponent(candidateQuery)}`,
      ),
    enabled: addOpen && candidateQuery.length > 0,
  });

  const columns: ColumnsType<MemberItem> = [
    {
      title: '帳號',
      key: 'account',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.nickname}</div>
          <div style={{ fontSize: 12, color: '#999' }}>{r.account ?? '—'}</div>
        </div>
      ),
    },
    {
      title: '層級',
      key: 'role',
      width: 200,
      render: (_, r) => {
        // 只能管「嚴格比自己低」的帳號；平級 / 更高層只顯示標籤不可改
        const canManage = actorRank > rankOf(r.role);
        if (!canManage) {
          return <Tag color={roleColor(r.role)}>{ROLE_LABEL[r.role]}</Tag>;
        }
        return (
          <Select<AdminRole>
            size="small"
            value={r.role}
            style={{ width: 150 }}
            loading={roleMutation.isPending}
            onChange={(role) => roleMutation.mutate({ id: r.id, role })}
            options={[
              // 目前層級（可能等於某個 assignable，避免重複）
              ...(assignableRoles.includes(r.role)
                ? []
                : [{ value: r.role, label: ROLE_LABEL[r.role], disabled: true }]),
              ...assignableRoles.map((role) => ({
                value: role,
                label: role === 'USER' ? '降為一般會員' : ROLE_LABEL[role],
              })),
            ]}
          />
        );
      },
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (s: string) =>
        s === 'ACTIVE' ? <Tag color="green">正常</Tag> : <Tag color="red">{s === 'BANNED' ? '封禁' : '停權'}</Tag>,
    },
    {
      title: '最後登入',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      width: 160,
      render: (d: string | null) => (d ? new Date(d).toLocaleString('zh-TW') : '—'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_, r) => {
        const canManage = actorRank > rankOf(r.role);
        if (!canManage) return <span style={{ color: '#ccc' }}>—</span>;
        return (
          <Space>
            <Button size="small" icon={<SettingOutlined />} onClick={() => setPermTarget(r)}>
              權限
            </Button>
            <Button size="small" icon={<KeyOutlined />} onClick={() => setPwTarget(r)}>
              重設密碼
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
            <SafetyCertificateOutlined style={{ marginRight: 8 }} />
            管理員管理
          </h2>
          <div style={{ marginTop: 6, fontSize: 13, color: '#8c8c8c' }}>
            你只能管理「比自己低階」的成員。你目前的身分：
            <Tag color={roleColor(user?.role ?? '')} style={{ marginLeft: 4 }}>
              {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
            </Tag>
          </div>
        </div>
        <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddOpen(true)}>
          新增管理員
        </Button>
      </div>

      <Input.Search
        placeholder="搜尋暱稱 / 帳號"
        allowClear
        enterButton
        style={{ width: 280, maxWidth: '100%', marginBottom: 16 }}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
      />

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
          showTotal: (t) => `共 ${t} 位管理團隊成員`,
          showSizeChanger: false,
        }}
        size="middle"
      />

      {/* 權限編輯抽屜 */}
      <AdminPermissionDrawer
        targetId={permTarget?.id ?? null}
        targetNickname={permTarget?.nickname}
        copySources={(data?.data.items ?? [])
          // 排除目標本人與 SUPER_ADMIN（超管無權限列，複製會把目標清空）
          .filter((m) => m.id !== permTarget?.id && m.role !== 'SUPER_ADMIN')
          .map((m) => ({ id: m.id, nickname: m.nickname, role: m.role }))}
        onClose={() => setPermTarget(null)}
      />

      {/* 重設密碼 */}
      <Modal
        title={`重設「${pwTarget?.nickname ?? ''}」的密碼`}
        open={!!pwTarget}
        onCancel={() => {
          setPwTarget(null);
          setPwValue('');
        }}
        onOk={() => {
          if (pwValue.trim().length < 8) {
            message.error('密碼至少 8 個字元');
            return;
          }
          if (pwTarget) pwMutation.mutate({ id: pwTarget.id, password: pwValue.trim() });
        }}
        okText="確定重設"
        confirmLoading={pwMutation.isPending}
      >
        <Input.Password
          placeholder="輸入新密碼（至少 8 字元）"
          value={pwValue}
          onChange={(e) => setPwValue(e.target.value)}
        />
      </Modal>

      {/* 新增管理員：搜尋一般會員 → 指派層級 */}
      <Modal
        title="新增管理員"
        open={addOpen}
        footer={null}
        onCancel={() => {
          setAddOpen(false);
          setCandidateSearch('');
          setCandidateQuery('');
        }}
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          搜尋要提升的一般會員，再指派層級（你只能指派比自己低的層級）。
        </Typography.Paragraph>
        <Input.Search
          placeholder="輸入暱稱 / 帳號搜尋"
          enterButton="搜尋"
          value={candidateSearch}
          onChange={(e) => setCandidateSearch(e.target.value)}
          onSearch={(v) => setCandidateQuery(v.trim())}
          style={{ marginBottom: 12 }}
        />
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {candidateQuery && (candidates?.data.items.length ?? 0) === 0 && !candidateLoading && (
            <Empty description="查無一般會員" />
          )}
          {candidates?.data.items.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 4px',
                borderBottom: '1px solid #f0f0f0',
                gap: 8,
              }}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{c.nickname}</div>
                <div style={{ fontSize: 12, color: '#999' }}>{c.account ?? '—'}</div>
              </div>
              <Space>
                {assignableRoles
                  .filter((r) => r !== 'USER')
                  .map((role) => (
                    <Popconfirm
                      key={role}
                      title={`將「${c.nickname}」設為${ROLE_LABEL[role]}？`}
                      onConfirm={() =>
                        roleMutation.mutate(
                          { id: c.id, role },
                          {
                            onSuccess: () => {
                              setAddOpen(false);
                              setCandidateSearch('');
                              setCandidateQuery('');
                            },
                          },
                        )
                      }
                    >
                      <Button size="small" type="link">
                        設為{ROLE_LABEL[role]}
                      </Button>
                    </Popconfirm>
                  ))}
              </Space>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
