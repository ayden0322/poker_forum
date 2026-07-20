'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/auth';
import { usePredictionBoards } from '@/lib/predictions';
import { LoginModal } from '@/components/auth/LoginModal';
import { PhoneVerifyModal } from '@/components/auth/PhoneVerifyModal';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import MemberBadges from '@/components/member/MemberBadges';
import { useMemberSummary } from '@/lib/member';
import AvatarWithFrame from '@/components/member/AvatarWithFrame';
import MainBadge from '@/components/member/MainBadge';

interface NavChild {
  label: string;
  href: string;
}

interface NavItem {
  label: string;
  href?: string;
  children?: (NavChild | { divider: true })[];
  /** mega menu：分欄顯示 */
  megaMenu?: { title: string; icon: string; items: NavChild[] }[];
  /** 特殊活動入口：紅色脈衝徽章樣式（如世界盃） */
  highlight?: { badgeText: string; emoji?: string; iconSrc?: string };
}

const navItems: NavItem[] = [
  { label: '首頁', href: '/' },
  {
    label: '體育賽事',
    megaMenu: [
      {
        title: '籃球·台亞',
        icon: '🏀',
        items: [
          { label: 'NBA', href: '/board/nba' },
          { label: 'FIBA 世界盃資格賽', href: '/board/fiba-wc-qualifiers' },
          { label: 'P.League+', href: '/board/p-league-plus' },
          { label: 'TPBL', href: '/board/tpbl' },
          { label: 'SBL 超籃', href: '/board/sbl' },
          { label: 'CBA 中國', href: '/board/cba' },
          { label: 'B.League 日本', href: '/board/b-league' },
          { label: 'KBL 韓國', href: '/board/kbl' },
          { label: '東亞超級聯賽', href: '/board/easl' },
          { label: 'VBA 越南', href: '/board/vba' },
          { label: 'NBL 印尼', href: '/board/indonesia-nbl' },
          { label: 'NBL 澳洲', href: '/board/australia-nbl' },
          { label: 'PBA 菲律賓', href: '/board/pba' },
          { label: '其他籃球', href: '/board/other-basketball' },
        ],
      },
      {
        title: '籃球·歐洲',
        icon: '🏀',
        items: [
          { label: 'Euroleague', href: '/board/euroleague' },
          { label: 'EuroCup', href: '/board/eurocup' },
          { label: 'ABA 聯賽', href: '/board/aba-league' },
          { label: 'ACB 西班牙', href: '/board/spain-acb' },
          { label: 'LNB 法國', href: '/board/france-lnb' },
          { label: 'Lega A 義大利', href: '/board/italy-lega-a' },
          { label: 'BBL 德國', href: '/board/germany-bbl' },
          { label: '希臘籃球', href: '/board/greece-basket-league' },
          { label: '土耳其籃球', href: '/board/turkey-super-ligi' },
          { label: 'LKL 立陶宛', href: '/board/lithuania-lkl' },
          { label: '波蘭籃球', href: '/board/poland-tbl' },
        ],
      },
      {
        title: '足球',
        icon: '⚽',
        items: [
          { label: '世界盃 2026', href: '/board/world-cup' },
          { label: '國際友誼賽', href: '/board/friendlies' },
          { label: '英超', href: '/board/epl' },
          { label: '西甲', href: '/board/la-liga' },
          { label: '義甲', href: '/board/serie-a' },
          { label: '德甲', href: '/board/bundesliga' },
          { label: '法甲', href: '/board/ligue-1' },
          { label: '歐冠', href: '/board/ucl' },
          { label: 'J 聯賽', href: '/board/j-league' },
          { label: '中超', href: '/board/csl' },
          { label: '其他足球', href: '/board/other-soccer' },
        ],
      },
      {
        title: '棒球',
        icon: '⚾',
        items: [
          { label: 'MLB', href: '/board/mlb' },
          { label: '中華職棒', href: '/board/cpbl' },
          { label: '日本職棒', href: '/board/npb' },
          { label: '韓國職棒', href: '/board/kbo' },
          { label: '其他棒球', href: '/board/other-baseball' },
        ],
      },
      {
        title: '其他',
        icon: '🏆',
        items: [
          { label: '網球', href: '/board/tennis' },
          { label: '冰球', href: '/board/hockey' },
          { label: '電競', href: '/board/esports' },
          { label: '格鬥', href: '/board/mma' },
          { label: '賽馬', href: '/board/horse-racing' },
        ],
      },
    ],
  },
  {
    label: 'FIFA 2026',
    href: '/board/world-cup',
    highlight: { badgeText: 'HOT', iconSrc: '/images/world-cup/trophy.png' },
  },
  {
    label: '台灣彩票',
    children: [
      { label: '📊 彩券中心', href: '/lottery' },
      { divider: true },
      { label: '大樂透', href: '/board/lotto649' },
      { label: '威力彩', href: '/board/super-lotto' },
      { label: '今彩 539', href: '/board/daily-cash' },
      { label: '3星彩 / 4星彩', href: '/board/star-lotto' },
      { divider: true },
      { label: '號碼統計', href: '/lottery/stats' },
      { label: '線上對獎', href: '/lottery/check' },
    ],
  },
  // 閒聊灌水：暫時隱藏（看板仍存在，僅 header 不顯示）
  // { label: '閒聊灌水', href: '/board/chat' },
];

export function Header() {
  const { user, accessToken, logout, showLoginModal, closeLoginModal, showPhoneVerifyModal, closePhoneVerifyModal } = useAuth();
  // 競猜入口跟著 PREDICTION_ENABLED 走（fail-closed：功能沒開連結不露）
  const { data: predData } = usePredictionBoards();
  const items = useMemo<NavItem[]>(() => {
    if (predData?.data.enabled !== true) return navItems;
    const withPredictions = [...navItems];
    const fifaIdx = withPredictions.findIndex((n) => n.label === 'FIFA 2026');
    withPredictions.splice(fifaIdx + 1, 0, { label: '賽事競猜', href: '/predictions' }, { label: '榮譽榜', href: '/honor' });
    return withPredictions;
  }, [predData?.data.enabled]);
  // 會員經濟總開關狀態（與 MemberBadges 共用快取）：關閉時連選單入口都不露（fail-closed）
  const { data: memberData } = useMemberSummary();
  const memberEnabled = memberData?.data?.enabled === true;
  const [showLogin, setShowLogin] = useState(false);
  const isLoginVisible = showLogin || showLoginModal;
  const handleCloseLogin = () => { setShowLogin(false); closeLoginModal(); };
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [expandedMobile, setExpandedMobile] = useState<string | null>(null);
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
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  const toggleMobileSection = (label: string) => {
    setExpandedMobile((prev) => (prev === label ? null : label));
  };

  return (
    <>
      <header className="bg-gradient-to-r from-blue-700 to-blue-900 text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16 md:h-20">
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
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo.png" alt="博客邦 GOBOKA" width={160} height={80} className="h-10 md:h-14 w-auto" priority />
            </Link>

            {/* 桌面版 Nav */}
            <nav className="hidden md:flex items-center gap-6">
              {items.map((item) =>
                item.megaMenu ? (
                  // Mega Menu（體育賽事）
                  <div key={item.label} className="relative group">
                    <span
                      className="text-sm font-medium hover:text-blue-200 transition-colors flex items-center gap-1 py-2 cursor-default select-none"
                      aria-haspopup="true"
                    >
                      {item.label}
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </span>
                    <div className="absolute left-0 top-full w-[820px] max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-4">
                      <div className="grid grid-cols-5 gap-4">
                        {item.megaMenu.map((col) => (
                          <div key={col.title}>
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                              <span>{col.icon}</span>
                              <span>{col.title}</span>
                            </div>
                            {col.items.map((child) => (
                              <Link
                                key={child.href}
                                href={child.href}
                                className="block px-2 py-1.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded transition-colors whitespace-nowrap"
                              >
                                {child.label}
                              </Link>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : item.children ? (
                  // 普通 Dropdown（台灣彩票）
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
                ) : item.highlight ? (
                  // 特殊活動入口：紅色脈衝徽章
                  <Link
                    key={item.href}
                    href={item.href!}
                    className="relative text-sm font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-md hover:shadow-lg hover:scale-105 transition-all whitespace-nowrap shrink-0"
                  >
                    {item.highlight.iconSrc ? (
                      <Image
                        src={item.highlight.iconSrc}
                        alt=""
                        width={20}
                        height={20}
                        className="w-5 h-5 object-contain drop-shadow"
                      />
                    ) : (
                      <span className="text-base leading-none">{item.highlight.emoji}</span>
                    )}
                    <span>{item.label}</span>
                    <span className="ml-0.5 px-1.5 py-0.5 bg-white text-red-600 text-[9px] font-black rounded-full leading-none">
                      {item.highlight.badgeText}
                    </span>
                    <span className="absolute inset-0 rounded-full bg-red-400/40 animate-ping pointer-events-none" />
                  </Link>
                ) : (
                  // 直接連結
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
                  <MemberBadges />
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

                  <div className="relative">
                    <button
                      onClick={() => setShowUserMenu((v) => !v)}
                      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    >
                      <AvatarWithFrame avatar={user.avatar} nickname={user.nickname} size={32} frame={user.cosmetics?.frame} />
                      <span className="text-sm font-medium hidden sm:block">{user.nickname}</span>
                      {user.cosmetics?.mainBadge && (
                        <span className="hidden sm:inline-flex">
                          <MainBadge badge={user.cosmetics.mainBadge} size={20} />
                        </span>
                      )}
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
                        {memberEnabled && (
                          <Link
                            href="/member-center"
                            className="block px-4 py-2 text-sm hover:bg-gray-50"
                            onClick={() => setShowUserMenu(false)}
                          >
                            會員中心
                          </Link>
                        )}
                        {predData?.data.enabled === true && (
                          <Link
                            href={`/predictions/record/${encodeURIComponent(user.nickname)}`}
                            className="block px-4 py-2 text-sm hover:bg-gray-50"
                            onClick={() => setShowUserMenu(false)}
                          >
                            競猜紀錄
                          </Link>
                        )}
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
          <div className="md:hidden border-t border-blue-600/50 max-h-[70vh] overflow-y-auto">
            <nav className="px-4 py-3 space-y-1">
              {items.map((item) => (
                <div key={item.label}>
                  {item.highlight && item.href ? (
                    <Link
                      href={item.href}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold bg-gradient-to-r from-red-500 to-orange-500 text-white shadow"
                      onClick={() => setShowMobileMenu(false)}
                    >
                      {item.highlight.iconSrc ? (
                        <Image
                          src={item.highlight.iconSrc}
                          alt=""
                          width={20}
                          height={20}
                          className="w-5 h-5 object-contain"
                        />
                      ) : (
                        <span className="text-base">{item.highlight.emoji}</span>
                      )}
                      <span>{item.label}</span>
                      <span className="ml-auto px-1.5 py-0.5 bg-white text-red-600 text-[9px] font-black rounded-full">
                        {item.highlight.badgeText}
                      </span>
                    </Link>
                  ) : item.href ? (
                    <Link
                      href={item.href}
                      className="block px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
                      onClick={() => setShowMobileMenu(false)}
                    >
                      {item.label}
                    </Link>
                  ) : item.megaMenu ? (
                    // 手機版 Mega Menu → Accordion
                    <>
                      <button
                        onClick={() => toggleMobileSection(item.label)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
                      >
                        <span>{item.label}</span>
                        <svg
                          className={`w-4 h-4 transition-transform ${expandedMobile === item.label ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {expandedMobile === item.label && (
                        <div className="mt-1 space-y-3 pb-2">
                          {item.megaMenu.map((col) => (
                            <div key={col.title}>
                              <div className="px-6 py-1 text-xs font-bold text-blue-300/70 uppercase tracking-wider flex items-center gap-1">
                                <span>{col.icon}</span>
                                <span>{col.title}</span>
                              </div>
                              {col.items.map((child) => (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  className="block px-8 py-1.5 text-xs text-blue-200 hover:text-white transition-colors"
                                  onClick={() => setShowMobileMenu(false)}
                                >
                                  {child.label}
                                </Link>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    // 手機版普通 Dropdown → Accordion
                    <>
                      <button
                        onClick={() => toggleMobileSection(item.label)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
                      >
                        <span>{item.label}</span>
                        <svg
                          className={`w-4 h-4 transition-transform ${expandedMobile === item.label ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {expandedMobile === item.label && item.children?.map((child, idx) =>
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
                    </>
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

      {isLoginVisible && (
        <LoginModal
          onClose={handleCloseLogin}
          onSwitchToRegister={() => { handleCloseLogin(); router.push('/register'); }}
        />
      )}

      {showPhoneVerifyModal && (
        <PhoneVerifyModal onClose={closePhoneVerifyModal} />
      )}

      {showUserMenu && (
        <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
      )}
    </>
  );
}
