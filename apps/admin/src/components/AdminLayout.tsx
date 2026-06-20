'use client';

import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, Avatar, Space, Spin, Tag } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  FileTextOutlined,
  RobotOutlined,
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
  SafetyCertificateOutlined,
  SettingOutlined,
  SkinOutlined,
} from '@ant-design/icons';
import { useRouter, usePathname } from 'next/navigation';
import { useAdminAuth } from '@/context/auth';
import { adminApiFetch } from '@/lib/api';
import { rankOf, ROLE_LABEL, type MinRole } from '@/lib/roles';

const { Sider, Content, Header } = Layout;

// pageKey 對應後端權限矩陣；minRole 僅作為 my-pages 載入前的 fallback，避免選單閃爍
type MenuEntry = {
  key: string;
  icon: React.ReactNode;
  label: string;
  pageKey: string;
  minRole: MinRole;
};

const menuItems: MenuEntry[] = [
  // 編輯人員日常
  { key: '/', icon: <DashboardOutlined />, label: '儀表板', pageKey: 'dashboard', minRole: 'MODERATOR' },
  { key: '/posts', icon: <FileTextOutlined />, label: '文章管理', pageKey: 'posts', minRole: 'MODERATOR' },
  { key: '/news', icon: <RobotOutlined />, label: '新聞審核', pageKey: 'news', minRole: 'MODERATOR' },
  { key: '/reports', icon: <FlagOutlined />, label: '檢舉管理', pageKey: 'reports', minRole: 'MODERATOR' },
  { key: '/feedbacks', icon: <MessageOutlined />, label: '意見回報', pageKey: 'feedbacks', minRole: 'MODERATOR' },
  // 總管理員以上
  { key: '/members', icon: <UserOutlined />, label: '會員管理', pageKey: 'members', minRole: 'ADMIN' },
  { key: '/admins', icon: <SafetyCertificateOutlined />, label: '管理員管理', pageKey: 'admins', minRole: 'ADMIN' },
  { key: '/boards', icon: <AppstoreOutlined />, label: '看板管理', pageKey: 'boards', minRole: 'ADMIN' },
  { key: '/categories', icon: <AppstoreOutlined />, label: '分類管理', pageKey: 'categories', minRole: 'ADMIN' },
  { key: '/tags', icon: <TagOutlined />, label: '標籤管理', pageKey: 'tags', minRole: 'ADMIN' },
  { key: '/announcements', icon: <NotificationOutlined />, label: '站方推送', pageKey: 'announcements', minRole: 'ADMIN' },
  { key: '/marquee', icon: <ColumnWidthOutlined />, label: '跑馬燈管理', pageKey: 'marquee', minRole: 'ADMIN' },
  { key: '/cosmetics', icon: <SkinOutlined />, label: '裝飾商店管理', pageKey: 'cosmetics', minRole: 'ADMIN' },
  { key: '/world-cup', icon: <TrophyOutlined />, label: '世界盃管理', pageKey: 'world-cup', minRole: 'ADMIN' },
  { key: '/translations', icon: <TranslationOutlined />, label: '翻譯管理', pageKey: 'translations', minRole: 'ADMIN' },
  // 超級管理員專屬（敏感）
  { key: '/banned-ips', icon: <StopOutlined />, label: '封鎖 IP', pageKey: 'banned-ips', minRole: 'SUPER_ADMIN' },
  { key: '/lottery', icon: <ThunderboltOutlined />, label: '彩券管理', pageKey: 'lottery', minRole: 'SUPER_ADMIN' },
  { key: '/sms-provider', icon: <MobileOutlined />, label: '簡訊服務商', pageKey: 'sms-provider', minRole: 'SUPER_ADMIN' },
  { key: '/sports-settings', icon: <TrophyOutlined />, label: '運彩 API 設定', pageKey: 'sports-settings', minRole: 'SUPER_ADMIN' },
  { key: '/permissions', icon: <SettingOutlined />, label: '權限設定', pageKey: 'permissions', minRole: 'SUPER_ADMIN' },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, isAuthenticated, logout } = useAdminAuth();

  const isPublicPage = pathname === '/login' || pathname === '/auth/callback';

  // 後端權限矩陣決定的可見頁；null = 尚未載入（先用 minRole fallback 避免閃爍）
  const [allowedKeys, setAllowedKeys] = useState<string[] | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPublicPage) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, isPublicPage, pathname, router]);

  // 載入目前帳號的可見頁（讀後端權限矩陣 /admin/my-pages）
  useEffect(() => {
    if (isAuthenticated && !isPublicPage) {
      adminApiFetch<{ data: { pages: string[] } }>('/admin/my-pages')
        .then((res) => setAllowedKeys(res.data.pages))
        .catch(() => setAllowedKeys(null));
    }
  }, [isAuthenticated, isPublicPage]);

  // 某選單項是否可見：矩陣載入後以矩陣為準，否則用 minRole fallback
  const isEntryAllowed = (m: MenuEntry) =>
    allowedKeys ? allowedKeys.includes(m.pageKey) : rankOf(user?.role) >= rankOf(m.minRole);

  const visibleMenu = menuItems.filter(isEntryAllowed);

  // 路由守衛：進到不可見的頁面就導向第一個可見頁（前端 UX，後端 API 另有把關）
  const currentEntry = menuItems.find((m) =>
    m.key === '/' ? pathname === '/' : pathname.startsWith(m.key),
  );
  const lacksAccess = !!currentEntry && !isEntryAllowed(currentEntry);
  const fallbackPath = visibleMenu[0]?.key ?? '/permissions';

  useEffect(() => {
    if (!isLoading && isAuthenticated && lacksAccess) {
      router.replace(fallbackPath);
    }
  }, [isLoading, isAuthenticated, lacksAccess, fallbackPath, router]);

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

  // 層級不足的頁面：導向中，不閃出內容
  if (lacksAccess) {
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
          items={visibleMenu.map(({ key, icon, label }) => ({ key, icon, label }))}
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
              {user?.role && (
                <Tag
                  color={
                    user.role === 'SUPER_ADMIN'
                      ? 'volcano'
                      : user.role === 'ADMIN'
                        ? 'red'
                        : 'blue'
                  }
                >
                  {ROLE_LABEL[user.role] ?? user.role}
                </Tag>
              )}
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
