import sanitizeHtml from 'sanitize-html';
import { Transform } from 'class-transformer';

/** 清除所有 HTML 標籤，只保留純文字（用於 title 等欄位） */
export function SanitizeHtml() {
  return Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    return sanitizeHtml(value, {
      allowedTags: [],
      allowedAttributes: {},
    });
  });
}

/** 白名單模式：只允許安全的 HTML 標籤和屬性（用於富文本 content 欄位） */
export function SanitizeRichHtml() {
  return Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    return sanitizeHtml(value, {
      allowedTags: [
        'p', 'br', 'strong', 'em', 'u', 's', 'del',
        'h2', 'h3',
        'ul', 'ol', 'li',
        'blockquote', 'pre', 'code',
        'a', 'img', 'hr',
        'span', 'div',
      ],
      allowedAttributes: {
        a: ['href', 'target', 'rel', 'class'],
        img: ['src', 'alt', 'width', 'height', 'class', 'style'],
        span: ['style', 'class'],
        div: ['style', 'class'],
        p: ['style', 'class'],
        h2: ['style', 'class'],
        h3: ['style', 'class'],
        pre: ['class'],
        code: ['class'],
      },
      allowedStyles: {
        span: {
          color: [/^#[0-9a-fA-F]{3,6}$/],
          'font-size': [/^(14|16|20)px$/],
        },
        p: {
          'text-align': [/^(left|center|right)$/],
        },
        h2: {
          'text-align': [/^(left|center|right)$/],
        },
        h3: {
          'text-align': [/^(left|center|right)$/],
        },
        div: {
          'text-align': [/^(left|center|right)$/],
        },
        img: {
          width: [/^\d+(%|px)$/],
        },
      },
      allowedSchemes: ['http', 'https', 'mailto'],
      // 防止 javascript: 等 scheme
      disallowedTagsMode: 'discard',
    });
  });
}
