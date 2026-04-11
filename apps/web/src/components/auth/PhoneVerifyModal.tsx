'use client';

import { useState, FormEvent, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth';

interface Props {
  onClose: () => void;
}

type Step = 'input-phone' | 'input-code' | 'done';

export function PhoneVerifyModal({ onClose }: Props) {
  const { refreshMe } = useAuth();
  const [step, setStep] = useState<Step>('input-phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ phone: string; expiresInSeconds: number }>('/verification/phone/send', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
      setMaskedPhone(res.phone);
      setStep('input-code');
      setCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : '發送失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiFetch<{ success: boolean }>('/verification/phone/confirm', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      await refreshMe();
      setStep('done');
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '驗證失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError('');
    setLoading(true);
    try {
      await apiFetch('/verification/phone/send', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
      setCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重送失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">手機驗證</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <p className="text-sm text-gray-600 mb-5">
          為了防止廣告與濫用，發表文章或回應前需要完成一次性的手機驗證（僅接受台灣門號）。
        </p>

        {step === 'input-phone' && (
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">手機號碼</label>
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
            {error && <p className="text-red-500 text-sm">{error}</p>}
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
                placeholder="123456"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg tracking-widest"
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-50"
            >
              {loading ? '驗證中…' : '完成驗證'}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => setStep('input-phone')}
                className="text-gray-500 hover:text-gray-700"
              >
                ← 修改號碼
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || loading}
                className="text-blue-600 hover:text-blue-700 disabled:text-gray-400"
              >
                {cooldown > 0 ? `重送（${cooldown}s）` : '重新發送'}
              </button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div className="text-center py-4">
            <div className="text-5xl mb-3">✓</div>
            <p className="text-lg font-medium text-gray-900">驗證成功！</p>
            <p className="text-sm text-gray-600 mt-1">現在可以發表文章與回應了</p>
          </div>
        )}
      </div>
    </div>
  );
}
