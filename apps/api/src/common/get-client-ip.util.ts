import { Request } from 'express';

/**
 * 從反向代理 / CDN 後面抓取真正的客戶端 IP。
 * 優先順序：Cloudflare → True-Client-IP → X-Forwarded-For (第一個) → req.ip → socket。
 * 需要 main.ts 有設定 `trust proxy`，否則 Express 不會信任上游 header。
 */
export function getClientIp(req: Request): string | undefined {
  const header = (name: string): string | undefined => {
    const v = req.headers[name.toLowerCase()];
    if (Array.isArray(v)) return v[0];
    return typeof v === 'string' ? v : undefined;
  };

  const cf = header('cf-connecting-ip');
  if (cf) return normalize(cf);

  const trueClient = header('true-client-ip');
  if (trueClient) return normalize(trueClient);

  const xff = header('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return normalize(first);
  }

  if (req.ip) return normalize(req.ip);

  const socketIp = (req.socket as any)?.remoteAddress;
  return socketIp ? normalize(socketIp) : undefined;
}

function normalize(ip: string): string {
  return ip.replace(/^::ffff:/, '');
}
