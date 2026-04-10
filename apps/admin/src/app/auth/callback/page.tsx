'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAdminAuth } from '@/context/auth';
import { Spin, Typography, message } from 'antd';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setTokens, isAuthenticated } = useAdminAuth();
  const [failed, setFailed] = useState(false);
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    if (accessToken && refreshToken) {
      setTokens(accessToken, refreshToken).catch((err) => {
        message.error(err instanceof Error ? err.message : '登入驗證失敗');
        setFailed(true);
      });
    } else {
      message.error('OAuth 登入失敗');
      setFailed(true);
    }
  }, [searchParams, setTokens]);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (failed) {
      router.replace('/login');
    }
  }, [failed, router]);

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
