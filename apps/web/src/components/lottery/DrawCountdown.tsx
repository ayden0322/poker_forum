'use client';

import { useEffect, useState } from 'react';

function countdownTo(iso: string, now: Date) {
  const target = new Date(iso).getTime();
  const diff = Math.max(0, target - now.getTime());
  return {
    d: Math.floor(diff / 86_400_000),
    h: Math.floor((diff % 86_400_000) / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1000),
    total: diff,
  };
}

interface Props {
  targetIso: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * 開獎倒數顯示
 * 在 stadium night 深底色面板上的金色 tabular 數字
 */
export function DrawCountdown({ targetIso, label = '距離下次開獎', size = 'md' }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const cd = now ? countdownTo(targetIso, now) : { d: 0, h: 0, m: 0, s: 0, total: 0 };
  const numCls = size === 'lg' ? 'text-3xl md:text-5xl' : size === 'sm' ? 'text-base' : 'text-2xl';
  const labelCls = size === 'lg' ? 'text-xs' : 'text-[10px]';
  const Unit = ({ v, l }: { v: number; l: string }) => (
    <div className="flex flex-col items-center">
      <span className={`font-bold tabular-nums leading-none ${numCls}`}>{String(v).padStart(2, '0')}</span>
      <span className={`text-amber-100/80 tracking-widest mt-1 ${labelCls}`}>{l}</span>
    </div>
  );
  const Sep = () => <span className={`text-amber-200/40 leading-none mb-3 ${numCls}`}>:</span>;
  return (
    <div className="inline-flex flex-col items-center">
      {label && <div className={`text-amber-100/70 tracking-widest mb-1.5 ${labelCls}`}>{label}</div>}
      <div className="flex items-end gap-2 md:gap-3">
        {cd.d > 0 && (
          <>
            <Unit v={cd.d} l="DAYS" />
            <Sep />
          </>
        )}
        <Unit v={cd.h} l="HOURS" />
        <Sep />
        <Unit v={cd.m} l="MINS" />
        <Sep />
        <Unit v={cd.s} l="SECS" />
      </div>
    </div>
  );
}
