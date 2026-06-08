/**
 * 全站對外網址的單一真相來源（single source of truth）。
 *
 * 正式環境請在 Zeabur 設定建置期環境變數 `NEXT_PUBLIC_SITE_URL=https://www.goboka.net`，
 * 沒設時 fallback 一律用正式網域，避免再出現 `forum.example.com` / `localhost:8080`
 * 漏進 sitemap、robots、og:image、JSON-LD。
 *
 * 注意：`NEXT_PUBLIC_*` 會在「建置期」被內聯，所以這個變數必須在 build 階段就存在。
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.goboka.net';
