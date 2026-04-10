'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAdminAuth } from '@/context/auth';
import { Spin, Typography, message } from 'antd';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setTokens } = useAdminAuth();

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    if (accessToken && refreshToken) {
      setTokens(accessToken, refreshToken)
        .then(() => {
          router.replace('/');
        })
        .catch(() => {
          message.error('此帳號不具有管理員權限');
          router.replace('/login');
        });
    } else {
      message.error('OAuth 登入失敗');
      router.replace('/login');
    }
  }, [searchParams, setTokens, router]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Spin size="large" />
      <Typography.Text style={{ marginTop: 16 }}>登入中，請稍候...</Typography.Text>
    </div>
  );
}

export default function AdminAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <Spin size="large" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
