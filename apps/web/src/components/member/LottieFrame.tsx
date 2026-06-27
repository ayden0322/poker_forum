'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

// lottie-web 用到 window，需 client-only 動態載入
const Lottie = dynamic(() => import('lottie-react'), { ssr: false });

/**
 * Lottie 動畫頭像框（傳說級）。只在個人頁/英雄區用（效能考量，列表不用）。
 * 透明背景，疊在頭像上、頭像從中央孔露出。尊重 prefers-reduced-motion。
 */
export default function LottieFrame({ url, size }: { url: string; size: number }) {
  const [data, setData] = useState<unknown>(null);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let alive = true;
    fetch(url).then((r) => r.json()).then((d) => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, [url]);

  if (!data) return null;
  return (
    <Lottie
      animationData={data}
      loop={!reduced.current}
      autoplay={!reduced.current}
      style={{ width: size, height: size, pointerEvents: 'none' }}
      rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
    />
  );
}
