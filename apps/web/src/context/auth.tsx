'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

interface AuthUser {
  id: string;
  nickname: string;
  role: string;
  avatar: string | null;
  level: number;
  phone?: string | null;
  phoneVerified?: boolean;
  phoneVerificationBypass?: boolean;
  nicknameChangedAt?: string | null;
  /** 若此 session 是管理員代登入產生的，後端會回填發起代登入的管理員 ID；否則為 null */
  impersonatedBy?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (account: string, password: string) => Promise<void>;
  logout: () => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  /** 需要登入時呼叫，會自動彈出登入 Modal。回傳 false 表示未登入 */
  requireLogin: () => boolean;
  showLoginModal: boolean;
  closeLoginModal: () => void;
  /** 需要完成手機驗證才能動作。回傳 false 並彈出驗證 Modal */
  requirePhoneVerified: () => boolean;
  showPhoneVerifyModal: boolean;
  openPhoneVerifyModal: () => void;
  closePhoneVerifyModal: () => void;
  /** 驗證成功後由 Modal 呼叫，重新載入使用者狀態 */
  refreshMe: () => Promise<void>;
  /** 結束管理員代登入，還原為原管理員身分（會把 token 換成管理員 token 並導回後台） */
  stopImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showPhoneVerifyModal, setShowPhoneVerifyModal] = useState(false);

  const fetchMe = useCallback(async (token: string) => {
    try {
      const res = await apiFetch<{ data: AuthUser }>('/auth/me', { token });
      setUser(res.data);
    } catch {
      setUser(null);
      setAccessToken(null);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      setAccessToken(token);
      fetchMe(token).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }

    // 監聽 token 刷新失敗的自動登出事件
    const handleLogout = () => {
      setUser(null);
      setAccessToken(null);
    };
    window.addEventListener('auth:logout', handleLogout);

    // 監聽 apiFetch 自動刷新成功，同步 context 的 accessToken，避免用到過期快取 token
    const handleTokenRefreshed = (e: Event) => {
      const t = (e as CustomEvent<string>).detail;
      if (t) setAccessToken(t);
    };
    window.addEventListener('auth:token-refreshed', handleTokenRefreshed);

    // 監聽後端 403 PHONE_VERIFICATION_REQUIRED 自動開 Modal
    const handlePhoneVerifyRequired = () => setShowPhoneVerifyModal(true);
    window.addEventListener('auth:phone-verification-required', handlePhoneVerifyRequired);

    return () => {
      window.removeEventListener('auth:logout', handleLogout);
      window.removeEventListener('auth:token-refreshed', handleTokenRefreshed);
      window.removeEventListener('auth:phone-verification-required', handlePhoneVerifyRequired);
    };
  }, [fetchMe]);

  const login = async (account: string, password: string) => {
    const res = await apiFetch<{ data: { user: AuthUser; accessToken: string; refreshToken: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ account, password }),
    });
    localStorage.setItem('accessToken', res.data.accessToken);
    localStorage.setItem('refreshToken', res.data.refreshToken);
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setAccessToken(null);
    setUser(null);
  };

  const setTokens = useCallback((at: string, rt: string) => {
    localStorage.setItem('accessToken', at);
    localStorage.setItem('refreshToken', rt);
    setAccessToken(at);
    fetchMe(at);
  }, [fetchMe]);

  /** 檢查是否已登入，未登入則彈出登入 Modal */
  const requireLogin = useCallback(() => {
    if (user) return true;
    setShowLoginModal(true);
    return false;
  }, [user]);

  const closeLoginModal = useCallback(() => {
    setShowLoginModal(false);
  }, []);

  const requirePhoneVerified = useCallback(() => {
    if (!user) {
      setShowLoginModal(true);
      return false;
    }
    if (user.phoneVerified || user.phoneVerificationBypass) return true;
    setShowPhoneVerifyModal(true);
    return false;
  }, [user]);

  const openPhoneVerifyModal = useCallback(() => setShowPhoneVerifyModal(true), []);
  const closePhoneVerifyModal = useCallback(() => setShowPhoneVerifyModal(false), []);

  const refreshMe = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (token) await fetchMe(token);
  }, [fetchMe]);

  const stopImpersonation = useCallback(async () => {
    const res = await apiFetch<{ success: boolean; data?: { accessToken: string; refreshToken: string } }>(
      '/auth/stop-impersonation',
      { method: 'POST' },
    );
    if (res.success && res.data) {
      // 換成原管理員 token，並導回後台
      localStorage.setItem('accessToken', res.data.accessToken);
      localStorage.setItem('refreshToken', res.data.refreshToken);
      const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:3011';
      window.location.href = `${adminUrl}/auth/callback?accessToken=${encodeURIComponent(res.data.accessToken)}&refreshToken=${encodeURIComponent(res.data.refreshToken)}`;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        login,
        logout,
        setTokens,
        requireLogin,
        showLoginModal,
        closeLoginModal,
        requirePhoneVerified,
        showPhoneVerifyModal,
        openPhoneVerifyModal,
        closePhoneVerifyModal,
        refreshMe,
        stopImpersonation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
