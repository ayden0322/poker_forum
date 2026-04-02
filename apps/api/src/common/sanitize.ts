import sanitizeHtml from 'sanitize-html';
import { Transform } from 'class-transformer';

/** 清除所有 HTML 標籤，只保留純文字 */
export function SanitizeHtml() {
  return Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    return sanitizeHtml(value, {
      allowedTags: [],        // 不允許任何 HTML 標籤
      allowedAttributes: {},  // 不允許任何屬性
    });
  });
}
