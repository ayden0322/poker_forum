import { Request } from 'express';

/**
 * 取真正的客戶端 IP。
 *
 * 一律以 Express 的 `req.ip` 為準——它由 main.ts 的 `trust proxy`（只信內網閘道）計算，
 * 已跳過可偽造的上游標頭，是目前架構下唯一可信的來源。
 *
 * 刻意「不」信任 `cf-connecting-ip` / `true-client-ip` / 原始 `x-forwarded-for`：
 * 本站走 Zeabur 灰雲、前面沒有 Cloudflare 代理，這些標頭訪客皆可自行偽造（已實測證實可繞限流）。
 * 若日後改走 Cloudflare 橘雲：把 trust proxy 設成信任 CF IP 範圍即可，CF 會正確覆寫 XFF、
 * req.ip 仍會是真實 client，不需再回頭信任這些標頭。
 */
export function getClientIp(req: Request): string | undefined {
  const ip = req.ip || (req.socket as { remoteAddress?: string } | undefined)?.remoteAddress;
  return ip ? normalize(ip) : undefined;
}

function normalize(ip: string): string {
  return ip.replace(/^::ffff:/, '');
}
