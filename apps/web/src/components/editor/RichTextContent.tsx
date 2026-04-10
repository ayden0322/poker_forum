'use client';

import DOMPurify from 'dompurify';
import { useEffect, useState } from 'react';

interface RichTextContentProps {
  content: string;
  className?: string;
}

/** 安全渲染富文本 HTML 內容 */
export default function RichTextContent({ content, className = '' }: RichTextContentProps) {
  const [sanitized, setSanitized] = useState('');

  useEffect(() => {
    // DOMPurify 只能在瀏覽器端執行
    const clean = DOMPurify.sanitize(content, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 's', 'del',
        'h2', 'h3',
        'ul', 'ol', 'li',
        'blockquote', 'pre', 'code',
        'a', 'img', 'hr',
        'span', 'div',
      ],
      ALLOWED_ATTR: [
        'href', 'target', 'rel',
        'src', 'alt', 'width', 'height',
        'class', 'style',
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    });
    setSanitized(clean);
  }, [content]);

  if (!content) return null;

  // 如果內容不含 HTML 標籤（純文字舊資料），用 pre-wrap 顯示
  const isPlainText = !/<[a-z][\s\S]*>/i.test(content);
  if (isPlainText) {
    return (
      <div className={`whitespace-pre-wrap leading-relaxed ${className}`}>
        {content}
      </div>
    );
  }

  return (
    <div
      className={`rich-text-content ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
