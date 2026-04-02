'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

interface AuthUser {
  id: string;
  nickname: string;
  role: string;
  avatar: string | null;
  level: number;
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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);

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
    return () => window.removeEventListener('auth:logout', handleLogout);
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

  return (
    <AuthContext.Provider value={{ user, accessToken, isLoading, login, logout, setTokens, requireLogin, showLoginModal, closeLoginModal }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
