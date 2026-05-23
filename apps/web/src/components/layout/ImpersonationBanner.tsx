'use client';

import { useState } from 'react';
import { useAuth } from '@/context/auth';

/**
 * 管理員代登入警示橫條。
 * 只有當 /auth/me 回傳的 impersonatedBy 不為 null 時顯示。
 * 點「結束代登入」會呼叫後端還原原管理員身分並導回後台。
 */
export function ImpersonationBanner() {
  const { user, stopImpersonation } = useAuth();
  const [stopping, setStopping] = useState(false);

  if (!user?.impersonatedBy) return null;

  const handleStop = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await stopImpersonation();
    } catch (err) {
      setStopping(false);
      // 失敗時顯示原生 alert 即可，避免引入額外通知元件
      alert(err instanceof Error ? err.message : '結束代登入失敗，請手動登出');
    }
  };

  return (
    <div
      role="alert"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        background: '#dc2626',
        color: '#fff',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: 14,
        fontWeight: 500,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden="true">⚠️</span>
        <span>
          你目前以「<strong>{user.nickname}</strong>」的身分操作（管理員代登入）。
          所有動作將以此身分留下紀錄。
        </span>
      </div>
      <button
        type="button"
        onClick={handleStop}
        disabled={stopping}
        style={{
          background: '#fff',
          color: '#dc2626',
          border: 'none',
          borderRadius: 4,
          padding: '6px 14px',
          fontSize: 13,
          fontWeight: 600,
          cursor: stopping ? 'not-allowed' : 'pointer',
          opacity: stopping ? 0.6 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {stopping ? '處理中…' : '結束代登入'}
      </button>
    </div>
  );
}
