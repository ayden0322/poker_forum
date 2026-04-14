'use client';

import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, Avatar, Space, Spin } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  FileTextOutlined,
  AppstoreOutlined,
  TagOutlined,
  NotificationOutlined,
  ColumnWidthOutlined,
  FlagOutlined,
  StopOutlined,
  ThunderboltOutlined,
  LogoutOutlined,
  MessageOutlined,
  MobileOutlined,
  TrophyOutlined,
  TranslationOutlined,
} from '@ant-design/icons';
import { useRouter, usePathname } from 'next/navigation';
import { useAdminAuth } from '@/context/auth';

const { Sider, Content, Header } = Layout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '儀表板' },
  { key: '/members', icon: <UserOutlined />, label: '會員管理' },
  { key: '/posts', icon: <FileTextOutlined />, label: '文章管理' },
  { key: '/boards', icon: <AppstoreOutlined />, label: '看板管理' },
  { key: '/categories', icon: <AppstoreOutlined />, label: '分類管理' },
  { key: '/tags', icon: <TagOutlined />, label: '標籤管理' },
  { key: '/announcements', icon: <NotificationOutlined />, label: '公告管理' },
  { key: '/marquee', icon: <ColumnWidthOutlined />, label: '跑馬燈管理' },
  { key: '/reports', icon: <FlagOutlined />, label: '檢舉管理' },
  { key: '/banned-ips', icon: <StopOutlined />, label: '封鎖 IP' },
  { key: '/lottery', icon: <ThunderboltOutlined />, label: '彩券管理' },
  { key: '/feedbacks', icon: <MessageOutlined />, label: '意見回報' },
  { key: '/sms-provider', icon: <MobileOutlined />, label: '簡訊服務商' },
  { key: '/sports-settings', icon: <TrophyOutlined />, label: '運彩 API 設定' },
  { key: '/translations', icon: <TranslationOutlined />, label: '翻譯管理' },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, isAuthenticated, logout } = useAdminAuth();

  const isPublicPage = pathname === '/login' || pathname === '/auth/callback';

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPublicPage) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, isPublicPage, pathname, router]);

  // 登入頁 / OAuth callback 不套用後台 layout
  if (isPublicPage) {
    return <>{children}</>;
  }

  // 載入中
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  // 未登入
  if (!isAuthenticated) {
    return null;
  }

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={0}
        theme="dark"
        style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: collapsed ? 14 : 18,
          fontWeight: 'bold',
        }}>
          {collapsed ? '管理' : '博客邦後台'}
        </div>
        <Menu
          theme="dark"
          selectedKeys={[pathname]}
          items={menuItems}
          onClick={({ key }) => router.push(key)}
        />
      </Sider>
      <Layout>
        <Header style={{
          background: '#fff',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          height: 'auto',
          minHeight: 64,
          flexWrap: 'wrap',
        }}>
          <Space size="middle">
            <Space>
              <Avatar src={user?.avatar} icon={<UserOutlined />} size={28} />
              <span style={{ fontWeight: 500 }}>{user?.nickname ?? '管理員'}</span>
            </Space>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              danger
            >
              登出
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: '16px 8px', padding: '16px 12px', background: '#fff', borderRadius: 8, overflow: 'auto' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
