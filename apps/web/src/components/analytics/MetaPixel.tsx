'use client';

import Script from 'next/script';
import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { META_PIXEL_ID, fbPageview } from '@/lib/fbpixel';

// App Router 是 SPA：官方 base code 只會在首次載入觸發一次 PageView。
// 這裡監聽路由變化，於每次切頁補打一次 PageView，讓瀏覽行為完整回傳。
function RouteChangePageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // 首次載入的 PageView 已由 base code 送出，避免重複計。
  const firstLoad = useRef(true);

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    fbPageview();
    // searchParams 一併納入依賴：query 變動（如切分頁 / 搜尋）也視為新頁。
  }, [pathname, searchParams]);

  return null;
}

export function MetaPixel() {
  // 未設定 Pixel ID（dev / staging）時完全不載入。
  if (!META_PIXEL_ID) return null;

  return (
    <>
      <Script id="meta-pixel-base" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${META_PIXEL_ID}');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
      <Suspense fallback={null}>
        <RouteChangePageView />
      </Suspense>
    </>
  );
}
