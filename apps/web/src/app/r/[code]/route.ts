import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

// 後端 API base（伺服器端優先用內網 API_URL）
const PROD_FALLBACK = 'https://api.goboka.net/api';
const DEV_FALLBACK = 'http://localhost:4010/api';
const FALLBACK = process.env.NODE_ENV === 'production' ? PROD_FALLBACK : DEV_FALLBACK;
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || FALLBACK;

/**
 * 推廣連結落地：/r/<code>
 * 1. 配發/沿用匿名訪客 id（pb_vid）。
 * 2. 設 pb_ref / pb_vid cookie（30 天，可被 JS 讀，供註冊頁帶入；domain 設母網域好讓 OAuth 在 API 子網域讀得到）。
 * 3. 伺服器端回報點擊（轉送真實 IP/UA，供後端去重 + bot 過濾）。
 * 4. 302 轉到 /register?ref=<code>（query 也帶一份，cookie 被擋時仍可歸因）。
 *
 * 注意：此路徑在 robots.ts Disallow，且回 noindex，避免被搜尋引擎索引/灌爆點擊。
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await ctx.params;
  const code = (rawCode || '').trim().toUpperCase().slice(0, 32);

  const visitorId = req.cookies.get('pb_vid')?.value || generateVisitorId();

  // 真實客戶端資訊（Next 在反向代理後）
  const xff = req.headers.get('x-forwarded-for') || '';
  const ua = req.headers.get('user-agent') || '';

  // 回報點擊（失敗不影響轉址）。回應的 valid 決定要不要覆寫 pb_ref——
  // 避免「先點有效 A 碼、再誤點壞/過期 B 碼」把既有有效歸因蓋掉。
  let codeValid = false;
  if (code) {
    try {
      const r = await fetch(`${API_URL}/promo/visit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-agent': ua,
          ...(xff ? { 'x-forwarded-for': xff } : {}),
        },
        body: JSON.stringify({ code, visitorId }),
        cache: 'no-store',
      });
      if (r.ok) {
        const data = (await r.json().catch(() => ({}))) as { valid?: boolean };
        codeValid = !!data.valid;
      }
    } catch {
      // 忽略
    }
  }

  // 只有有效碼才把 ref 帶進註冊頁 query（壞碼不污染歸因）
  const url = new URL('/register', req.url);
  if (codeValid) url.searchParams.set('ref', code);

  const res = NextResponse.redirect(url, 302);
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');

  const domain = cookieDomain(req.nextUrl.hostname);
  const base = {
    httpOnly: false, // 註冊頁需用 JS 讀取帶入 body
    sameSite: 'lax' as const,
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    ...(domain ? { domain } : {}),
  };
  // 只在碼有效時覆寫 pb_ref；pb_vid 一律維持（漏斗串接用）
  if (codeValid) res.cookies.set('pb_ref', code, base);
  res.cookies.set('pb_vid', visitorId, base);

  return res;
}

function generateVisitorId(): string {
  // crypto.randomUUID 在 Node 18+ / Edge 皆可用
  return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`).replace(
    /-/g,
    '',
  );
}

/**
 * 推導 cookie 母網域，讓 web 與 api 子網域共用（OAuth strategy 在 API 端讀取）。
 * - localhost / IP → 不設 domain（host-only，本機同 host 不同 port 仍會送）。
 * - 否則取最後兩段（如 www.goboka.net → .goboka.net）。可用 NEXT_PUBLIC_PROMO_COOKIE_DOMAIN 覆蓋。
 */
function cookieDomain(hostname: string): string | undefined {
  const override = process.env.NEXT_PUBLIC_PROMO_COOKIE_DOMAIN;
  if (override) return override;
  if (hostname === 'localhost' || /^[\d.]+$/.test(hostname)) return undefined;
  const parts = hostname.split('.');
  if (parts.length < 2) return undefined;
  return '.' + parts.slice(-2).join('.');
}
