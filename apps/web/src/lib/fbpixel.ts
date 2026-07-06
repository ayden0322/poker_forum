// Meta (Facebook) Pixel 共用工具。
// Pixel ID 走環境變數：未設定時所有函式皆為 no-op，
// dev / staging 不帶 NEXT_PUBLIC_META_PIXEL_ID 就不會載入、不會污染數據。

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '';

type FbqArgs =
  | ['init', string]
  | ['track', string, Record<string, unknown>?]
  | ['trackCustom', string, Record<string, unknown>?]
  | [string, ...unknown[]];

declare global {
  interface Window {
    fbq?: ((...args: FbqArgs) => void) & { queue?: unknown[] };
    _fbq?: unknown;
  }
}

function ready(): boolean {
  return typeof window !== 'undefined' && typeof window.fbq === 'function' && !!META_PIXEL_ID;
}

/** 標準事件（PageView / ViewContent / Search / CompleteRegistration ...） */
export function fbTrack(event: string, params?: Record<string, unknown>): void {
  if (!ready()) return;
  window.fbq!('track', event, params);
}

/** 自訂事件 */
export function fbTrackCustom(event: string, params?: Record<string, unknown>): void {
  if (!ready()) return;
  window.fbq!('trackCustom', event, params);
}

/** 手動補打 PageView（SPA 路由切換時使用） */
export function fbPageview(): void {
  fbTrack('PageView');
}
