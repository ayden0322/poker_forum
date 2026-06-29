'use client';

// isomorphic-dompurify：server（jsdom）與 client 皆可 sanitize，讓貼文內文在 SSR HTML 就渲染出來
// （論壇命脈內容不再藏在 client JS 後面），同一份 sanitize 輸出兩端一致 → 無 hydration mismatch。
import DOMPurify from 'isomorphic-dompurify';

interface RichTextContentProps {
  content: string;
  className?: string;
}

/**
 * UGC 連結防護：使用者貼文/回覆內的連結一律標記 rel="ugc nofollow"，不把站點權重傳出去，
 * 降低被灌垃圾外鏈（娛樂城/借貸 spam）拉權重的風險；外開連結補 noopener noreferrer 防 tabnabbing。
 * DOMPurify 為全域單例，hook 只註冊一次即可套用到所有 sanitize 呼叫（server/client 皆然）。
 */
let ugcLinkHookRegistered = false;
function ensureUgcLinkHook() {
  if (ugcLinkHookRegistered) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName === 'A' && node.getAttribute('href')) {
      node.setAttribute('rel', 'ugc nofollow noopener noreferrer');
      node.setAttribute('target', '_blank');
    }
  });
  ugcLinkHookRegistered = true;
}

/** 安全渲染富文本 HTML 內容（server + client 同步 sanitize） */
export default function RichTextContent({ content, className = '' }: RichTextContentProps) {
  if (!content) return null;

  // 內容不含 HTML 標籤（純文字舊資料）→ 用 pre-wrap 顯示
  const isPlainText = !/<[a-z][\s\S]*>/i.test(content);
  if (isPlainText) {
    return (
      <div className={`whitespace-pre-wrap leading-relaxed ${className}`}>
        {content}
      </div>
    );
  }

  ensureUgcLinkHook();
  const sanitized = DOMPurify.sanitize(content, {
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

  return (
    <div
      className={`rich-text-content ${className}`}
      // server/client sanitize 理論上一致；保險起見抑制極端情況下的 hydration 警告（僅此元素）
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
