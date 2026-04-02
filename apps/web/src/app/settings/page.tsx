'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth';
import { apiFetch } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api';
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function SettingsPage() {
  const { user, accessToken, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user?.avatar) setAvatarPreview(user.avatar);
  }, [user]);

  if (authLoading || !user) {
    return <div className="text-center py-20 text-gray-400">載入中...</div>;
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 前端基本檢查
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('僅支援 JPG、PNG、WebP、GIF 格式');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('圖片大小不能超過 2MB');
      return;
    }

    setError('');
    setAvatarFile(file);

    // 本地預覽
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (newPassword && newPassword !== confirmPassword) {
      setError('新密碼與確認密碼不一致');
      return;
    }

    setLoading(true);
    try {
      // 1. 如果有新頭像檔案，先上傳
      if (avatarFile) {
        const formData = new FormData();
        formData.append('file', avatarFile);

        const uploadRes = await fetch(`${API_URL}/upload/avatar`, {
          method: 'POST',
          headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: formData,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({ message: '上傳失敗' })) as { message?: string };
          throw new Error(err.message || '頭像上傳失敗');
        }

        const uploadData = await uploadRes.json() as { data: { url: string } };
        setAvatarPreview(uploadData.data.url);
        setAvatarFile(null); // 上傳成功，清除待上傳檔案
      }

      // 2. 如果有修改密碼，更新密碼
      if (newPassword) {
        await apiFetch('/users/me', {
          method: 'PATCH',
          token: accessToken ?? undefined,
          body: JSON.stringify({
            newPassword,
            currentPassword,
          }),
        });
      }

      setMessage('更新成功！');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">個人設定</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        {/* 個人資訊（唯讀） */}
        <div className="mb-6 pb-6 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">帳號資訊</h2>
          <div className="space-y-2 text-sm">
            <div className="flex">
              <span className="w-20 text-gray-500">暱稱</span>
              <span className="font-medium text-gray-900">{user.nickname}</span>
              <span className="ml-2 text-xs text-gray-400">（不可更改）</span>
            </div>
            <div className="flex">
              <span className="w-20 text-gray-500">等級</span>
              <span className="font-medium text-gray-900">Lv.{user.level}</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 頭像上傳 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">頭像</label>
            <div className="flex items-center gap-4">
              {/* 頭像預覽 */}
              <div
                className="w-20 h-20 rounded-full bg-gray-100 border-2 border-gray-200 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="頭像預覽"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl text-gray-300">{user.nickname.charAt(0)}</span>
                )}
              </div>

              <div className="flex-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  選擇圖片
                </button>
                <p className="text-xs text-gray-400 mt-1">
                  支援 JPG、PNG、WebP、GIF，最大 2MB
                </p>
                {avatarFile && (
                  <p className="text-xs text-blue-500 mt-1">
                    已選擇：{avatarFile.name}（{(avatarFile.size / 1024).toFixed(0)} KB）
                  </p>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>

          {/* 修改密碼 */}
          <div className="pt-4 border-t border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">修改密碼（選填）</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">目前密碼</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="請輸入目前密碼"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">新密碼</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="8 字以上，需包含英文和數字"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">確認新密碼</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再輸入一次新密碼"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>
          </div>

          {message && <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">{message}</p>}
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '儲存中...' : '儲存設定'}
          </button>
        </form>
      </div>

      {/* 危險區域 */}
      <div className="mt-4 bg-white rounded-2xl shadow-sm border border-red-100 p-6">
        <h2 className="text-sm font-semibold text-red-700 mb-3">危險操作</h2>
        <button
          onClick={logout}
          className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
        >
          登出帳號
        </button>
      </div>
    </div>
  );
}
