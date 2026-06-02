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
  Switch,
} from 'antd';
import {
  UserOutlined,
  StopOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  StopFilled,
  KeyOutlined,
  LoginOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';

import { adminApiFetch } from '@/lib/api';

const { Text } = Typography;

type LoginMethod = 'ACCOUNT' | 'GOOGLE' | 'LINE' | 'FACEBOOK';

interface Member {
  id: string;
  nickname: string;
  account: string | null;
  email: string | null;
  avatar: string | null;
  level: number;
  role: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';
  status: 'ACTIVE' | 'BANNED' | 'SUSPENDED';
  lastLoginIp: string | null;
  lastLoginAt: string | null;
  phone: string | null;
  phoneVerified: boolean;
  phoneVerificationBypass: boolean;
  phoneVerificationBypassReason: string | null;
  loginMethods: LoginMethod[];
  postCount: number;
  replyCount: number;
  followerCount: number;
  followingCount: number;
  createdAt: string;
}

const LOGIN_METHOD_LABEL: Record<LoginMethod, { label: string; color: string }> = {
  ACCOUNT: { label: '帳號', color: 'default' },
  GOOGLE: { label: 'Google', color: 'red' },
  LINE: { label: 'LINE', color: 'green' },
  FACEBOOK: { label: 'Facebook', color: 'blue' },
};

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

interface MembersResponse {
  data: {
    items: Member[];
    total: number;
    page: number;
    limit: number;
  };
}

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: '正常' },
  { value: 'SUSPENDED', label: '停權' },
  { value: 'BANNED', label: '封禁' },
];

export default function MembersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [detailMember, setDetailMember] = useState<Member | null>(null);
  const [banIpTarget, setBanIpTarget] = useState<{ ip: string; nickname: string } | null>(null);
  const [banReason, setBanReason] = useState('');
  const [passwordTarget, setPasswordTarget] = useState<Member | null>(null);
  const [impersonateTarget, setImpersonateTarget] = useState<Member | null>(null);
  const [impersonateReason, setImpersonateReason] = useState('');
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', '20');
  if (search) queryParams.set('q', search);
  if (statusFilter) queryParams.set('status', statusFilter);
  queryParams.set('tier', 'user'); // 會員管理只顯示一般會員；管理團隊請到「管理員管理」頁

  const { data, isLoading } = useQuery({
    queryKey: ['admin-members', page, search, statusFilter],
    queryFn: () => adminApiFetch<MembersResponse>(`/admin/members?${queryParams}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: {
        role?: string;
        status?: string;
        phoneVerified?: boolean;
        phoneVerificationBypass?: boolean;
        phoneVerificationBypassReason?: string | null;
      };
    }) =>
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

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      adminApiFetch(`/admin/members/${id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password }),
      }),
    onSuccess: () => {
      message.success('密碼已更新');
      setPasswordTarget(null);
      passwordForm.resetFields();
    },
    onError: (err: Error) => message.error(err.message),
  });

  const impersonateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      adminApiFetch<{
        data: {
          accessToken: string;
          refreshToken: string;
          target: { id: string; nickname: string; role: string };
        };
      }>(`/admin/members/${id}/impersonate`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: (res) => {
      const { accessToken, refreshToken } = res.data;
      // 開新分頁進入前台 OAuth callback 既有的 token 接收流程
      // 用 query string 而非 hash：前台 callback 頁面已用 useSearchParams 讀取
      const webUrl = process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3010';
      const url = `${webUrl}/auth/callback?accessToken=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      message.success(`已開啟新分頁以「${res.data.target.nickname}」身分登入`);
      setImpersonateTarget(null);
      setImpersonateReason('');
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
    form.setFieldsValue({
      status: member.status,
      phoneVerified: member.phoneVerified,
      phoneVerificationBypass: member.phoneVerificationBypass,
      phoneVerificationBypassReason: member.phoneVerificationBypassReason ?? '',
    });
  };

  const handleSave = () => {
    form
      .validateFields()
      .then(
        (values: {
          status: string;
          phoneVerified: boolean;
          phoneVerificationBypass: boolean;
          phoneVerificationBypassReason?: string;
        }) => {
          if (!editingMember) return;
          const reason = values.phoneVerificationBypassReason?.trim() || null;
          // 只有「從已驗證取消為未驗證」時才送 phoneVerified，避免不必要更新與後端誤判
          const phoneVerifiedChanged =
            editingMember.phoneVerified && values.phoneVerified === false;
          updateMutation.mutate({
            id: editingMember.id,
            body: {
              status: values.status,
              ...(phoneVerifiedChanged ? { phoneVerified: false } : {}),
              phoneVerificationBypass: values.phoneVerificationBypass,
              phoneVerificationBypassReason: values.phoneVerificationBypass ? reason : null,
            },
          });
        },
      );
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
      SUPER_ADMIN: { color: 'volcano', label: '最高管理員' },
    };
    const { color, label } = map[role] ?? map.USER;
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
      title: '登入方式',
      dataIndex: 'loginMethods',
      key: 'loginMethods',
      width: 160,
      render: (methods: LoginMethod[]) => {
        if (!methods || methods.length === 0) return '—';
        return (
          <Space size={4} wrap>
            {methods.map((m) => {
              const info = LOGIN_METHOD_LABEL[m];
              return <Tag key={m} color={info?.color ?? 'default'}>{info?.label ?? m}</Tag>;
            })}
          </Space>
        );
      },
    },
    {
      title: '手機驗證',
      key: 'phoneVerified',
      width: 170,
      render: (_, record) => {
        if (record.phoneVerified) {
          return (
            <Space size={4}>
              <Tag color="success">已驗證</Tag>
              <Text style={{ fontSize: 12 }}>{record.phone}</Text>
            </Space>
          );
        }
        if (record.phoneVerificationBypass) {
          return (
            <Tag color="processing" title={record.phoneVerificationBypassReason ?? ''}>
              後台放行
            </Tag>
          );
        }
        return <Tag>未驗證</Tag>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 280,
      render: (_, record) => (
        <Space wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailMember(record)}>
            檢視
          </Button>
          <Button size="small" onClick={() => handleEdit(record)}>
            編輯
          </Button>
          <Button
            size="small"
            icon={<KeyOutlined />}
            onClick={() => {
              setPasswordTarget(record);
              passwordForm.resetFields();
            }}
          >
            重設密碼
          </Button>
          {record.role !== 'ADMIN' && record.role !== 'SUPER_ADMIN' && record.status !== 'BANNED' && (
            <Button
              size="small"
              icon={<LoginOutlined />}
              style={{ background: '#fff7e6', borderColor: '#fa8c16', color: '#d46b08' }}
              onClick={() => {
                setImpersonateTarget(record);
                setImpersonateReason('');
              }}
            >
              代登入
            </Button>
          )}
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
        scroll={{ x: 1100 }}
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
          {/* 角色／層級調整已移至「管理員管理」頁，會員管理只處理一般會員的狀態與驗證 */}
          <Form.Item label="狀態" name="status" rules={[{ required: true }]}>
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item
            label="電話已驗證"
            name="phoneVerified"
            valuePropName="checked"
            tooltip={
              editingMember?.phoneVerified
                ? '關閉後將清除此會員的手機驗證紀錄，下次發文 / 回應需重新完成 SMS 驗證。'
                : '此會員目前未通過 SMS 驗證。後台無法直接設為已驗證，如需放行請改用下方「後台放行」。'
            }
          >
            <Switch
              disabled={!editingMember?.phoneVerified}
              checkedChildren="已驗證"
              unCheckedChildren="未驗證"
            />
          </Form.Item>
          <Form.Item
            label="免手機驗證（後台放行）"
            name="phoneVerificationBypass"
            valuePropName="checked"
            tooltip="開啟後此會員不需要完成手機驗證即可發文 / 回應。phoneVerified 真假狀態仍會保留以供稽核。"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) =>
              prev.phoneVerificationBypass !== curr.phoneVerificationBypass
            }
          >
            {({ getFieldValue }) =>
              getFieldValue('phoneVerificationBypass') ? (
                <Form.Item
                  label="放行原因（選填，建議填寫以利稽核）"
                  name="phoneVerificationBypassReason"
                >
                  <Input.TextArea rows={2} placeholder="例如：管理員帳號 / 內部測試 / 客服 …" />
                </Form.Item>
              ) : null
            }
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
              <Descriptions.Item label="手機驗證">
                {detailMember.phoneVerified ? (
                  <Space size={4}>
                    <Tag color="success">已驗證</Tag>
                    <Text>{detailMember.phone}</Text>
                  </Space>
                ) : detailMember.phoneVerificationBypass ? (
                  <Space size={4} direction="vertical">
                    <Tag color="processing">後台放行</Tag>
                    {detailMember.phoneVerificationBypassReason && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        原因：{detailMember.phoneVerificationBypassReason}
                      </Text>
                    )}
                  </Space>
                ) : (
                  <Tag>未驗證</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="登入方式">
                {detailMember.loginMethods && detailMember.loginMethods.length > 0 ? (
                  <Space size={4} wrap>
                    {detailMember.loginMethods.map((m) => {
                      const info = LOGIN_METHOD_LABEL[m];
                      return <Tag key={m} color={info?.color ?? 'default'}>{info?.label ?? m}</Tag>;
                    })}
                  </Space>
                ) : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="最後登入時間">
                {formatDateTime(detailMember.lastLoginAt)}
              </Descriptions.Item>
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

      {/* 重設密碼 Modal */}
      <Modal
        title={`重設密碼：${passwordTarget?.nickname}`}
        open={!!passwordTarget}
        onOk={() => {
          passwordForm
            .validateFields()
            .then((values: { password: string }) => {
              if (!passwordTarget) return;
              resetPasswordMutation.mutate({
                id: passwordTarget.id,
                password: values.password,
              });
            });
        }}
        onCancel={() => {
          setPasswordTarget(null);
          passwordForm.resetFields();
        }}
        confirmLoading={resetPasswordMutation.isPending}
        okText="確認更新"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        destroyOnClose
      >
        <p style={{ marginTop: 0 }}>
          將直接覆寫帳號 <Text code>{passwordTarget?.account ?? '—'}</Text> 的登入密碼，
          此操作無法復原。請務必透過安全管道告知會員新密碼。
        </p>
        <Form form={passwordForm} layout="vertical" preserve={false}>
          <Form.Item
            label="新密碼"
            name="password"
            rules={[
              { required: true, message: '請輸入新密碼' },
              { min: 8, message: '密碼長度至少 8 個字元' },
              { max: 64, message: '密碼長度不可超過 64 個字元' },
            ]}
            hasFeedback
          >
            <Input.Password placeholder="至少 8 個字元" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            label="再次輸入新密碼"
            name="confirm"
            dependencies={['password']}
            hasFeedback
            rules={[
              { required: true, message: '請再次輸入新密碼' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('兩次輸入的密碼不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="再輸入一次以確認" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 代登入確認 Modal */}
      <Modal
        title={`以「${impersonateTarget?.nickname}」身分登入`}
        open={!!impersonateTarget}
        onOk={() => {
          if (!impersonateTarget) return;
          impersonateMutation.mutate({
            id: impersonateTarget.id,
            reason: impersonateReason.trim() || undefined,
          });
        }}
        onCancel={() => {
          setImpersonateTarget(null);
          setImpersonateReason('');
        }}
        confirmLoading={impersonateMutation.isPending}
        okText="確認代登入"
        okButtonProps={{ danger: true, icon: <LoginOutlined /> }}
        cancelText="取消"
      >
        <div style={{ background: '#fff7e6', border: '1px solid #ffd591', padding: 12, borderRadius: 4, marginBottom: 12 }}>
          <Text strong style={{ color: '#d46b08' }}>⚠️ 高權限操作</Text>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: '#874d00' }}>
            <li>會在新分頁以該會員身分開啟前台，token 有效 1 小時</li>
            <li>所有操作將以該會員身分留下紀錄（發文 / 推文 / 檢舉等）</li>
            <li>本次代登入會寫入後台稽核紀錄，含你的管理員 ID</li>
            <li>除錯完畢請從前台警示列點「結束代登入」回到管理員身分</li>
          </ul>
        </div>
        <Form layout="vertical">
          <Form.Item
            label="代登入原因（選填，建議填寫以利稽核）"
            tooltip="例如：協助 user 重現無法發文問題 #1234"
          >
            <Input.TextArea
              rows={3}
              maxLength={500}
              value={impersonateReason}
              onChange={(e) => setImpersonateReason(e.target.value)}
              placeholder="例如：協助會員重現無法發文問題"
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>

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
