/**
 * CPBL Proxy — 反向代理到 cpbl.com.tw
 *
 * 部署在 Zeabur 台灣 GCP 節點，給博客邦 API（在 Zeabur 大阪）使用。
 * 大阪機房連 cpbl.com.tw 會被 HiNet CDN 擋（404），所以走這個台灣 proxy 中繼。
 */
import { createServer } from 'http';
import { request as httpsRequest } from 'https';
import { URL } from 'url';

const PORT = parseInt(process.env.PORT || '8080', 10);
const TARGET_HOST = 'www.cpbl.com.tw';

const server = createServer((req, res) => {
  // 健康檢查
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('OK\n');
    return;
  }

  // 反向代理到 cpbl.com.tw
  const targetUrl = new URL(req.url, `https://${TARGET_HOST}`);

  // 複製 headers 但改 host
  const headers = { ...req.headers };
  headers.host = TARGET_HOST;

  // 移除可能讓 cpbl 識別為 proxy 的 header
  delete headers['x-forwarded-for'];
  delete headers['x-forwarded-proto'];
  delete headers['x-forwarded-host'];
  delete headers['x-real-ip'];
  delete headers['cf-connecting-ip'];
  delete headers['cf-ray'];

  // 確保有 User-Agent（避免被當機器人）
  if (!headers['user-agent']) {
    headers['user-agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
  }

  const options = {
    hostname: TARGET_HOST,
    port: 443,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers,
  };

  const proxyReq = httpsRequest(options, (proxyRes) => {
    // 透傳 status + headers
    const responseHeaders = { ...proxyRes.headers };
    // 不透傳 set-cookie 的 domain 屬性（讓 cookie 綁我們自己的域名）
    if (responseHeaders['set-cookie']) {
      responseHeaders['set-cookie'] = (responseHeaders['set-cookie']).map((c) =>
        c.replace(/Domain=[^;]+;?\s*/i, ''),
      );
    }
    res.writeHead(proxyRes.statusCode || 502, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[Proxy Error] ${req.method} ${req.url}: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`Bad Gateway: ${err.message}\n`);
    }
  });

  // 設超時
  proxyReq.setTimeout(30000, () => {
    proxyReq.destroy(new Error('Upstream timeout'));
  });

  // 透傳 body
  req.pipe(proxyReq);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`CPBL Proxy listening on :${PORT} → https://${TARGET_HOST}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
