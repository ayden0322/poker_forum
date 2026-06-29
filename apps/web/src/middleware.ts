import { NextRequest, NextResponse } from 'next/server';

/**
 * 主機正規化：非 www（apex）一律 301 永久轉址到 https://www.goboka.net，統一 canonical 主機。
 *
 * 為什麼需要：Zeabur 把 goboka.net 與 www.goboka.net 都綁到同一服務、兩邊都回 200，
 * 會被 Google 當成兩份重複內容、權重劈半。Zeabur 平台層沒有「網域→網域 301」開關，
 * 故在 app 層用 301（永久）把 apex 收斂到 www，與全站 metadata 的 canonical 信號一致。
 *
 * 註：http→https 那一跳由 Zeabur 自動處理（302）；本 middleware 只負責 https 後的 apex→www。
 * apex 的 http 請求會經「Zeabur 302 → https://goboka.net → 本 middleware 301 → https://www.goboka.net」兩跳，Google 可正常跟隨。
 */
const CANONICAL_HOST = 'www.goboka.net';
const APEX_HOST = 'goboka.net';

export function middleware(req: NextRequest) {
  // 代理後原始主機優先看 x-forwarded-host，再退回 host；去掉 port、轉小寫
  const rawHost = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
  const host = rawHost.split(':')[0].toLowerCase();

  if (host === APEX_HOST) {
    const { pathname, search } = req.nextUrl;
    return NextResponse.redirect(`https://${CANONICAL_HOST}${pathname}${search}`, 301);
  }

  return NextResponse.next();
}

export const config = {
  // 跑在頁面與 sitemap.xml / robots.txt 等路徑上（apex 的這些也要被導到 www）；
  // 排除 Next 內部靜態資源，避免不必要的 middleware 開銷。
  matcher: ['/((?!_next/static|_next/image).*)'],
};
