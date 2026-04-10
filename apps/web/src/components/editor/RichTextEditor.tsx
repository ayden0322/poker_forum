'use client';

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { TextAlign } from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extension-placeholder';
import { useState, useCallback, useRef, useEffect } from 'react';
import ImageEditModal from './ImageEditModal';
import GifPicker from './GifPicker';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://api.goboka.net/api' : 'http://localhost:4010/api');

/* ─── 預設色盤 ─── */
const COLOR_PALETTE = [
  { label: '黑', value: '#000000' },
  { label: '紅', value: '#DC2626' },
  { label: '藍', value: '#2563EB' },
  { label: '綠', value: '#16A34A' },
  { label: '橘', value: '#EA580C' },
  { label: '紫', value: '#9333EA' },
  { label: '粉', value: '#EC4899' },
  { label: '青', value: '#0891B2' },
  { label: '棕', value: '#92400E' },
  { label: '灰', value: '#6B7280' },
];

/* ─── 文字大小（透過 inline style） ─── */
const FONT_SIZES = [
  { label: '小', value: '14px' },
  { label: '中', value: '16px' },
  { label: '大', value: '20px' },
];

/* ─── 自訂 FontSize extension ─── */
const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attributes) => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}` };
        },
      },
    };
  },
});

/* ─── Props ─── */
interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** 精簡模式（回覆用）：隱藏標題、對齊等進階功能 */
  compact?: boolean;
  minHeight?: string;
}

/* ─── 工具列按鈕 ─── */
function ToolbarButton({
  active,
  onClick,
  title,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

/* ─── 分隔線 ─── */
function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5" />;
}

/* ─── 顏色選擇器 ─── */
function ColorPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const currentColor = editor.getAttributes('textStyle').color || '#000000';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="文字顏色"
        className="p-1.5 rounded text-gray-600 hover:bg-gray-100 flex items-center gap-0.5"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M12 3L4 21h3l2-5h6l2 5h3L12 3z" />
        </svg>
        <div className="w-4 h-1 rounded-sm" style={{ backgroundColor: currentColor }} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 p-2.5 bg-white border border-gray-200 rounded-lg shadow-lg z-50 grid grid-cols-5 gap-2" style={{ minWidth: '160px' }}>
          {COLOR_PALETTE.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.label}
              onClick={() => {
                if (c.value === '#000000') {
                  editor.chain().focus().unsetColor().run();
                } else {
                  editor.chain().focus().setColor(c.value).run();
                }
                setOpen(false);
              }}
              className="w-7 h-7 rounded-md border border-gray-300 hover:scale-110 transition-transform hover:shadow-sm"
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── 字體大小選擇器 ─── */
function FontSizePicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const currentSize = editor.getAttributes('textStyle').fontSize;
  const currentLabel = FONT_SIZES.find((s) => s.value === currentSize)?.label || '中';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="文字大小"
        className="px-2 py-1 rounded text-xs font-medium text-gray-600 hover:bg-gray-100 flex items-center gap-0.5 min-w-[36px] justify-center"
      >
        {currentLabel}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 min-w-[80px]">
          {FONT_SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => {
                if (s.value === '16px') {
                  editor.chain().focus().unsetMark('textStyle').run();
                } else {
                  editor.chain().focus().setMark('textStyle', { fontSize: s.value }).run();
                }
                setOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${
                currentSize === s.value || (!currentSize && s.value === '16px')
                  ? 'text-blue-600 font-medium'
                  : 'text-gray-700'
              }`}
            >
              <span style={{ fontSize: s.value }}>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── 主元件 ─── */
export default function RichTextEditor({
  content,
  onChange,
  placeholder = '請輸入內容...',
  compact = false,
  minHeight = '200px',
}: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gifBtnRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const savedSelectionRef = useRef<number | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: compact ? false : { levels: [2, 3] },
      }),
      Underline,
      FontSize,
      Color,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-blue-600 underline hover:text-blue-800', rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            style: {
              default: null,
              parseHTML: (element) => element.getAttribute('style') || null,
              renderHTML: (attributes) => {
                if (!attributes.style) return {};
                return { style: attributes.style };
              },
            },
          };
        },
      }).configure({
        HTMLAttributes: { class: 'max-w-full rounded-lg my-2' },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({ placeholder }),
    ],
    immediatelyRender: false,
    content,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none px-4 py-3`,
        style: `min-height: ${minHeight}`,
      },
      handleDrop: (view, event, _slice, moved) => {
        if (!moved && event.dataTransfer?.files?.length) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            handleImageUpload(file);
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) handleImageUpload(file);
            return true;
          }
        }
        return false;
      },
    },
  });

  const handleImageUpload = useCallback(async (file: File) => {
    if (!editor) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('圖片大小不能超過 5MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('只能上傳圖片檔案');
      return;
    }

    setUploading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_URL}/upload/image`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: '上傳失敗' }));
        throw new Error(err.message || '上傳失敗');
      }

      const data = await res.json() as { data: { url: string } };
      // 儲存游標位置，Modal 關閉後用來恢復
      savedSelectionRef.current = editor.state.selection.anchor;
      setPendingImageUrl(data.data.url);
    } catch (err) {
      alert(err instanceof Error ? err.message : '圖片上傳失敗');
    } finally {
      setUploading(false);
    }
  }, [editor]);

  const handleImageConfirm = useCallback((url: string, sizePercent: number, keepOpen: boolean) => {
    if (!editor) return;
    // 先恢復游標位置，確保 editor 有正確的插入點
    const pos = savedSelectionRef.current;
    if (pos !== null) {
      const safePos = Math.min(pos, editor.state.doc.content.size);
      editor.chain().focus().setTextSelection(safePos).run();
    } else {
      editor.chain().focus().run();
    }
    // 用百分比寬度插入，讓圖片相對於容器縮放
    const widthStyle = sizePercent && sizePercent < 100 ? ` style="width: ${sizePercent}%"` : '';
    editor.chain().insertContent(`<img src="${url}"${widthStyle} />`).run();
    // 更新游標位置到插入後的位置（供「插入並繼續」使用）
    savedSelectionRef.current = editor.state.selection.anchor;
    if (!keepOpen) setPendingImageUrl(null);
  }, [editor]);

  const handleImageCancel = useCallback(() => {
    setPendingImageUrl(null);
  }, []);

  const handleGifSelect = useCallback((gifUrl: string) => {
    if (!editor) return;
    editor.chain().focus().setImage({ src: gifUrl }).run();
    setGifPickerOpen(false);
  }, [editor]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('請輸入連結網址', previousUrl || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
      {/* 工具列 */}
      <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        {/* 粗體 */}
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="粗體 (Ctrl+B)"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" />
          </svg>
        </ToolbarButton>

        {/* 斜體 */}
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="斜體 (Ctrl+I)"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" />
          </svg>
        </ToolbarButton>

        {/* 底線 */}
        <ToolbarButton
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="底線 (Ctrl+U)"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z" />
          </svg>
        </ToolbarButton>

        {/* 刪除線 */}
        <ToolbarButton
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="刪除線"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z" />
          </svg>
        </ToolbarButton>

        <Divider />

        {/* 文字顏色 */}
        <ColorPicker editor={editor} />

        {/* 文字大小 */}
        <FontSizePicker editor={editor} />

        <Divider />

        {/* 標題（僅完整模式） */}
        {!compact && (
          <>
            <ToolbarButton
              active={editor.isActive('heading', { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              title="標題 H2"
            >
              <span className="text-xs font-bold">H2</span>
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive('heading', { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              title="標題 H3"
            >
              <span className="text-xs font-bold">H3</span>
            </ToolbarButton>
            <Divider />
          </>
        )}

        {/* 無序清單 */}
        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="無序清單"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z" />
          </svg>
        </ToolbarButton>

        {/* 有序清單 */}
        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="有序清單"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z" />
          </svg>
        </ToolbarButton>

        {/* 引用 */}
        <ToolbarButton
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="引用區塊"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />
          </svg>
        </ToolbarButton>

        {/* 程式碼 */}
        <ToolbarButton
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="程式碼區塊"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        </ToolbarButton>

        <Divider />

        {/* 對齊（僅完整模式） */}
        {!compact && (
          <>
            <ToolbarButton
              active={editor.isActive({ textAlign: 'left' })}
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
              title="靠左"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z" />
              </svg>
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive({ textAlign: 'center' })}
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
              title="置中"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z" />
              </svg>
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive({ textAlign: 'right' })}
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
              title="靠右"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z" />
              </svg>
            </ToolbarButton>
            <Divider />
          </>
        )}

        {/* 連結 */}
        <ToolbarButton
          active={editor.isActive('link')}
          onClick={addLink}
          title="插入連結"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </ToolbarButton>

        {/* 圖片上傳 */}
        <ToolbarButton
          onClick={() => fileInputRef.current?.click()}
          title="上傳圖片"
          disabled={uploading}
        >
          {uploading ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </ToolbarButton>

        {/* GIF 選擇器 */}
        <div ref={gifBtnRef}>
          <ToolbarButton
            onClick={() => setGifPickerOpen(!gifPickerOpen)}
            title="插入 GIF"
          >
            <span className="text-xs font-bold leading-none">GIF</span>
          </ToolbarButton>
          {gifPickerOpen && (
            <GifPicker
              onSelect={handleGifSelect}
              onClose={() => setGifPickerOpen(false)}
              anchorRef={gifBtnRef}
            />
          )}
        </div>

        {/* 分隔線（僅完整模式） */}
        {!compact && (
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="分隔線"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 11h20v2H2z" />
            </svg>
          </ToolbarButton>
        )}
      </div>

      {/* 編輯區 */}
      <EditorContent editor={editor} />

      {/* 隱藏的 file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImageUpload(file);
          e.target.value = '';
        }}
      />

      {/* 上傳提示 */}
      {uploading && (
        <div className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs border-t border-gray-200">
          圖片上傳中...
        </div>
      )}

      {/* 圖片調整 Modal */}
      {pendingImageUrl && (
        <ImageEditModal
          imageUrl={pendingImageUrl}
          onConfirm={handleImageConfirm}
          onCancel={handleImageCancel}
        />
      )}
    </div>
  );
}
