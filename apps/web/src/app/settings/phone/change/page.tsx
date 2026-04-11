'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth';
import { apiFetch } from '@/lib/api';

export default function PhoneChangePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');

  if (!user) {
    return <div className="text-center py-20 text-gray-400">請先登入</div>;
  }
  if (!user.phoneVerified) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <p className="text-gray-600">你尚未完成首次手機驗證，無法進行換綁</p>
        <button
          onClick={() => router.push('/settings')}
          className="mt-4 text-blue-600 hover:underline"
        >
          回到設定頁
        </button>
      </div>
    );
  }

  const handleRequest = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ sentTo: string; expiresInSeconds: number }>(
        '/verification/phone/change/request-email',
        { method: 'POST', body: JSON.stringify({}) },
      );
      setSentTo(res.sentTo);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '發送失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">更換綁定手機</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <p className="text-sm text-gray-600 mb-4">
          為了保護帳號安全，更換手機前需先驗證 Email。
          點擊下方按鈕後，我們會寄送驗證信到你註冊時使用的 Email，
          點擊信中連結即可繼續換綁流程。
        </p>

        {!sent ? (
          <>
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <button
              onClick={handleRequest}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-50"
            >
              {loading ? '發送中…' : '寄送 Email 驗證信'}
            </button>
          </>
        ) : (
          <div className="text-center">
            <div className="text-4xl mb-3">📧</div>
            <p className="text-gray-900 font-medium">驗證信已寄出</p>
            <p className="text-sm text-gray-600 mt-2">
              請至 <span className="font-medium">{sentTo}</span> 信箱查收，
              連結 15 分鐘內有效。
            </p>
          </div>
        )}
      </div>

      <button
        onClick={() => router.push('/settings')}
        className="mt-4 text-sm text-gray-500 hover:text-gray-700"
      >
        ← 回到設定頁
      </button>
    </div>
  );
}
