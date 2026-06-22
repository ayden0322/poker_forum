import { Request } from 'express';

/** 推廣歸因 cookie 名稱（由 web 端 /r/<code> 落地頁設定，domain 設 eTLD+1 以便回傳到 API）。 */
export const PROMO_REF_COOKIE = 'pb_ref';
export const PROMO_VID_COOKIE = 'pb_vid';

/**
 * 從請求 cookie 取出推廣歸因（OAuth 流程用：strategy 在 callback 請求中讀取）。
 * 帳密註冊走 request body，不經此函式。
 */
export function readPromoAttribution(req: Request): { refCode?: string; visitorId?: string } {
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  return {
    refCode: cookies?.[PROMO_REF_COOKIE] || undefined,
    visitorId: cookies?.[PROMO_VID_COOKIE] || undefined,
  };
}
