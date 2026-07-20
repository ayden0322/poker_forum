'use client';

// G→P 兌換面板（會員中心錢包區用；1 G = 10 P，單向不可回換）
// 拒單是狀態不是錯誤：訊息列顯示、輸入保留。

import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';

const P_PER_G = 10;
const CHIPS = [10, 50, 100];

export default function ExchangePanel({ gBalance }: { gBalance: number }) {
  const queryClient = useQueryClient();
  const [g, setG] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const requestIdRef = useRef('');

  useMemo(() => {
    requestIdRef.current = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g]);

  const submit = async () => {
    if (!g || g <= 0 || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await apiFetch('/member/exchange', {
        method: 'POST',
        body: JSON.stringify({ g, requestId: requestIdRef.current }),
      });
      setDone(g * P_PER_G);
      setG(null);
      queryClient.invalidateQueries({ queryKey: ['member'] });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INSUFFICIENT_BALANCE') {
        setNotice('G 幣不足——完成每日任務可以賺 G 幣');
      } else {
        setNotice(e instanceof ApiError ? e.message : '連線異常，請稍後再試');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg bg-gray-50 p-3">
      <div className="text-xs text-gray-500">
        G 幣兌換 P 幣（1 G = {P_PER_G} P，單向不可換回）
      </div>
      <div className="mt-2 flex gap-2">
        {CHIPS.map((c) => (
          <button
            key={c}
            onClick={() => { setG(c); setDone(null); }}
            disabled={c > gBalance}
            className={`px-3 py-1.5 rounded-lg border text-sm font-mono-stadium tabular-nums transition-colors ${
              g === c ? 'bg-[#39B8BE] border-[#39B8BE] text-white' : 'border-gray-200 text-gray-700 hover:border-[#39B8BE]/60 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            {c} G
          </button>
        ))}
        <button
          onClick={submit}
          disabled={!g || busy}
          className="ml-auto px-4 py-1.5 rounded-lg bg-[#39B8BE] text-white text-sm font-medium hover:opacity-90 disabled:bg-gray-200 disabled:text-gray-400"
        >
          {busy ? '兌換中…' : g ? `換 ${g * P_PER_G} P` : '兌換'}
        </button>
      </div>
      {notice && <div className="mt-2 text-xs text-amber-700">{notice}</div>}
      {done && <div className="mt-2 text-xs text-[#2a8d92]">已兌換 +{done} P ✓</div>}
    </div>
  );
}
