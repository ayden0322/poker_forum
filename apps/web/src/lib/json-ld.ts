/**
 * 安全序列化 JSON-LD 後注入 <script type="application/ld+json">。
 *
 * JSON.stringify 不會 escape `<`，若內容含使用者資料（貼文標題/內文/暱稱），
 * 可能出現 `</script>` 提早關閉標籤造成 XSS / script-breakout。
 * 這裡額外 escape `<`、`>`、`&` 與 U+2028/U+2029（JSON 合法但 JS 字串非法的行分隔符）。
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(String.fromCharCode(0x2028))
    .join('\\u2028')
    .split(String.fromCharCode(0x2029))
    .join('\\u2029');
}
