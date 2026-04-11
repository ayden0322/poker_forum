'use client';

import { Suspense, useEffect, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/auth';
import { apiFetch } from '@/lib/api';

function PhoneChangeConfirmInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { refreshMe } = useAuth();

  const token = params.get('token') || '';
  const [step, setStep] = useState<'verifying' | 'input-phone' | 'input-code' | 'done' | 'error'>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const [changeSession, setChangeSession] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setStep('error');
      setErrorMsg('連結無效');
      return;
    }
    (async () => {
      try {
        const res = await apiFetch<{ changeSession: string }>('/verification/phone/change/confirm-email', {
          method: 'POST',
          body: JSON.stringify({ token }),
        });
        setChangeSession(res.changeSession);
        setStep('input-phone');
      } catch (err) {
        setStep('error');
        setErrorMsg(err instanceof Error ? err.message : '驗證失敗');
      }
    })();
  }, [token]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await apiFetch<{ phone: string }>('/verification/phone/change/send', {
        method: 'POST',
        body: JSON.stringify({ phone, changeSession }),
      });
      setMaskedPhone(res.phone);
      setStep('input-code');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '發送失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      await apiFetch('/verification/phone/change/confirm', {
        method: 'POST',
        body: JSON.stringify({ code, changeSession }),
      });
      await refreshMe();
      setStep('done');
      setTimeout(() => router.push('/settings'), 1500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '驗證失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">更換手機 — Email 驗證</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        {step === 'verifying' && <p className="text-gray-500">驗證 Email 中...</p>}

        {step === 'error' && (
          <>
            <p className="text-red-500 font-medium">{errorMsg}</p>
            <button
              onClick={() => router.push('/settings/phone/change')}
              className="mt-4 text-blue-600 hover:underline"
            >
              重新申請換綁
            </button>
          </>
        )}

        {step === 'input-phone' && (
          <form onSubmit={handleSend} className="space-y-4">
            <p className="text-sm text-green-600">✓ Email 驗證成功，請輸入新的手機號碼</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">新手機號碼</label>
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0912345678"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-50"
            >
              {loading ? '發送中…' : '取得驗證碼'}
            </button>
          </form>
        )}

        {step === 'input-code' && (
          <form onSubmit={handleConfirm} className="space-y-4">
            <p className="text-sm text-gray-600">
              驗證碼已發送至 <span className="font-medium">{maskedPhone}</span>
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">6 位數驗證碼</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg tracking-widest"
              />
            </div>
            {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-50"
            >
              {loading ? '驗證中…' : '完成換綁'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="text-center py-4">
            <div className="text-5xl mb-3">✓</div>
            <p className="text-lg font-medium text-gray-900">換綁成功！</p>
            <p className="text-sm text-gray-600 mt-1">正在返回設定頁…</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-gray-400">載入中...</div>}>
      <PhoneChangeConfirmInner />
    </Suspense>
  );
}
