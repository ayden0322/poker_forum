'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth';
import { LoginModal } from '@/components/auth/LoginModal';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface NavChild {
  label: string;
  href: string;
}

interface NavItem {
  label: string;
  /** 沒給 href 時，頂層只是 hover 觸發選單，不可點擊 */
  href?: string;
  children?: (NavChild | { divider: true })[];
}

const navItems: NavItem[] = [
  { label: '討論區', href: '/' },
  {
    label: '體育賽事',
    children: [
      { label: '棒球', href: '/board/baseball' },
      { label: '籃球', href: '/board/basketball' },
      { label: '足球', href: '/board/soccer' },
      { label: '其他運動', href: '/board/other-sports' },
    ],
  },
  {
    label: '台灣彩票',
    children: [
      { label: '大樂透', href: '/board/lotto649' },
      { label: '威力彩', href: '/board/super-lotto' },
      { label: '今彩 539', href: '/board/daily-cash' },
      { label: '3星彩 / 4星彩', href: '/board/star-lotto' },
      { divider: true },
      { label: '號碼統計', href: '/lottery/stats' },
      { label: '線上對獎', href: '/lottery/check' },
    ],
  },
  { label: '閒聊灌水', href: '/board/chat' },
];

export function Header() {
  const { user, accessToken, logout, showLoginModal, closeLoginModal } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  // 合併 context 與 local 的登入 Modal 狀態
  const isLoginVisible = showLogin || showLoginModal;
  const handleCloseLogin = () => { setShowLogin(false); closeLoginModal(); };
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
    setSearchQuery('');
    setShowMobileMenu(false);
  };

  // 輪詢未讀通知數
  const fetchUnread = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await apiFetch<{ data: { count: number } }>('/notifications/unread-count', { token: accessToken });
      setUnreadCount(res.data.count);
    } catch {
      // 忽略
    }
  }, [accessToken]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000); // 每 30 秒
    return () => clearInterval(interval);
  }, [fetchUnread]);

  return (
    <>
      <header className="bg-gradient-to-r from-blue-700 to-blue-900 text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* 手機版漢堡選單按鈕 */}
            <button
              className="md:hidden p-2 -ml-2 hover:bg-white/10 rounded-lg transition-colors"
              onClick={() => setShowMobileMenu((v) => !v)}
              aria-label="選單"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {showMobileMenu ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            {/* Logo */}
            <Link href="/" className="text-xl font-bold tracking-wide flex items-center gap-2">
              博客邦
            </Link>

            {/* 桌面版 Nav */}
            <nav className="hidden md:flex items-center gap-6">
              {navItems.map((item) =>
                item.children ? (
                  <div key={item.label} className="relative group">
                    <span
                      className="text-sm font-medium hover:text-blue-200 transition-colors flex items-center gap-1 py-2 cursor-default select-none"
                      aria-haspopup="true"
                    >
                      {item.label}
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </span>
                    <div className="absolute left-0 top-full w-40 bg-white rounded-lg shadow-lg border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 py-1">
                      {item.children.map((child, idx) =>
                        'divider' in child ? (
                          <hr key={`d-${idx}`} className="my-1 border-gray-100" />
                        ) : (
                          <Link
                            key={child.href}
                            href={child.href}
                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600"
                          >
                            {child.label}
                          </Link>
                        ),
                      )}
                    </div>
                  </div>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href!}
                    className="text-sm font-medium hover:text-blue-200 transition-colors"
                  >
                    {item.label}
                  </Link>
                ),
              )}
            </nav>

            {/* 桌面版搜尋框 */}
            <form onSubmit={handleSearch} className="hidden md:flex items-center">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋文章..."
                  className="w-44 lg:w-56 pl-9 pr-3 py-1.5 rounded-full bg-white/15 text-sm text-white placeholder-blue-200 border border-white/20 focus:outline-none focus:bg-white/25 focus:border-white/40 transition-all"
                />
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </form>

            {/* Auth + 通知 */}
            <div className="flex items-center gap-2 sm:gap-3">
              {user ? (
                <>
                  {/* 通知鈴鐺 */}
                  <Link
                    href="/notifications"
                    className="relative p-2 hover:bg-white/10 rounded-lg transition-colors"
                    aria-label="通知"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-medium">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </Link>

                  {/* 使用者選單 */}
                  <div className="relative">
                    <button
                      onClick={() => setShowUserMenu((v) => !v)}
                      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    >
                      {user.avatar ? (
                        <Image src={user.avatar} alt={user.nickname} width={32} height={32} className="rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center text-sm font-bold">
                          {user.nickname.charAt(0)}
                        </div>
                      )}
                      <span className="text-sm font-medium hidden sm:block">{user.nickname}</span>
                      <span className="text-xs opacity-70 hidden sm:block">▾</span>
                    </button>

                    {showUserMenu && (
                      <div className="absolute right-0 top-full mt-2 w-44 bg-white text-gray-800 rounded-xl shadow-xl py-1 z-50">
                        <Link
                          href={`/user/${user.nickname}`}
                          className="block px-4 py-2 text-sm hover:bg-gray-50"
                          onClick={() => setShowUserMenu(false)}
                        >
                          個人主頁
                        </Link>
                        <Link
                          href="/settings"
                          className="block px-4 py-2 text-sm hover:bg-gray-50"
                          onClick={() => setShowUserMenu(false)}
                        >
                          個人設定
                        </Link>
                        <Link
                          href="/bookmarks"
                          className="block px-4 py-2 text-sm hover:bg-gray-50"
                          onClick={() => setShowUserMenu(false)}
                        >
                          我的收藏
                        </Link>
                        <Link
                          href="/notifications"
                          className="block px-4 py-2 text-sm hover:bg-gray-50"
                          onClick={() => setShowUserMenu(false)}
                        >
                          通知中心
                          {unreadCount > 0 && (
                            <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                              {unreadCount}
                            </span>
                          )}
                        </Link>
                        <hr className="my-1 border-gray-100" />
                        <button
                          onClick={() => { logout(); setShowUserMenu(false); }}
                          className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          登出
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Link
                    href="/register"
                    className="text-sm px-3 sm:px-4 py-1.5 rounded border border-white/30 hover:bg-white/10 transition-colors"
                  >
                    註冊
                  </Link>
                  <button
                    onClick={() => setShowLogin(true)}
                    className="text-sm px-3 sm:px-4 py-1.5 rounded bg-white text-blue-800 font-medium hover:bg-blue-50 transition-colors"
                  >
                    登入
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 手機版展開選單 */}
        {showMobileMenu && (
          <div className="md:hidden border-t border-blue-600/50">
            <nav className="px-4 py-3 space-y-1">
              {navItems.map((item) => (
                <div key={item.label}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="block px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
                      onClick={() => setShowMobileMenu(false)}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <div className="block px-3 py-2 text-sm font-semibold text-blue-100/90">
                      {item.label}
                    </div>
                  )}
                  {item.children?.map((child, idx) =>
                    'divider' in child ? (
                      <hr key={`md-${idx}`} className="my-1 border-blue-600/40 mx-6" />
                    ) : (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="block px-6 py-1.5 text-xs text-blue-200 hover:text-white transition-colors"
                        onClick={() => setShowMobileMenu(false)}
                      >
                        {child.label}
                      </Link>
                    ),
                  )}
                </div>
              ))}
              <form onSubmit={handleSearch} className="px-3 pt-2">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜尋文章..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/15 text-sm text-white placeholder-blue-200 border border-white/20 focus:outline-none focus:bg-white/25 transition-all"
                  />
                  <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </form>
            </nav>
          </div>
        )}
      </header>

      {/* Login Modal — 由 Header 自身或任何元件透過 requireLogin() 觸發 */}
      {isLoginVisible && (
        <LoginModal
          onClose={handleCloseLogin}
          onSwitchToRegister={() => { handleCloseLogin(); router.push('/register'); }}
        />
      )}

      {/* 點擊外部關閉用戶選單 */}
      {showUserMenu && (
        <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
      )}
    </>
  );
}
