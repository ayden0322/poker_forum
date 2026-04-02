'use client';

import { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Typography, message, Space } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useAdminAuth } from '@/context/auth';
import { useRouter } from 'next/navigation';

const { Title, Text } = Typography;

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAdminAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/');
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSubmit = async (values: { account: string; password: string }) => {
    setSubmitting(true);
    try {
      await login(values.account, values.password);
      message.success('登入成功');
      router.push('/');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '登入失敗';
      message.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0f2f5' }}>
        <Text>載入中...</Text>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)',
      }}
    >
      <Card
        style={{ width: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}
        styles={{ body: { padding: 32 } }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%', textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ margin: 0 }}>博客邦管理後台</Title>
          <Text type="secondary">請使用管理員帳號登入</Text>
        </Space>

        <Form layout="vertical" onFinish={handleSubmit} autoComplete="off">
          <Form.Item
            name="account"
            rules={[{ required: true, message: '請輸入帳號' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="管理員帳號"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '請輸入密碼' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密碼"
              size="large"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={submitting}
            >
              登入
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
