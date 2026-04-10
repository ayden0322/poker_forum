'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { adminApiFetch } from '@/lib/api';

interface AdminUser {
  id: string;
  nickname: string;
  role: string;
  avatar: string | null;
  level: number;
}

interface AdminAuthContextValue {
  user: AdminUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (account: string, password: string) => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res = await adminApiFetch<{ data: AdminUser }>('/auth/me');
      if (res.data.role !== 'ADMIN') {
        throw new Error('非管理員帳號');
      }
      setUser(res.data);
    } catch {
      setUser(null);
      localStorage.removeItem('admin_accessToken');
      localStorage.removeItem('admin_refreshToken');
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('admin_accessToken');
    if (token) {
      fetchMe().finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [fetchMe]);

  const login = async (account: string, password: string) => {
    const res = await adminApiFetch<{
      data: { user: AdminUser; accessToken: string; refreshToken: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ account, password }),
      skipAuth: true,
    });

    if (res.data.user.role !== 'ADMIN') {
      throw new Error('此帳號不具有管理員權限');
    }

    localStorage.setItem('admin_accessToken', res.data.accessToken);
    localStorage.setItem('admin_refreshToken', res.data.refreshToken);
    setUser(res.data.user);
  };

  const setTokens = async (accessToken: string, refreshToken: string) => {
    localStorage.setItem('admin_accessToken', accessToken);
    localStorage.setItem('admin_refreshToken', refreshToken);
    await fetchMe();
  };

  const logout = () => {
    localStorage.removeItem('admin_accessToken');
    localStorage.removeItem('admin_refreshToken');
    setUser(null);
  };

  return (
    <AdminAuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        setTokens,
        logout,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
