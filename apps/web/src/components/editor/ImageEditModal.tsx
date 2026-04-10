'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://api.goboka.net/api' : 'http://localhost:4010/api');

/* ─── 尺寸預設 ─── */
const SIZE_PRESETS = [
  { label: '小', value: 25 },
  { label: '中', value: 50 },
  { label: '大', value: 75 },
  { label: '全寬', value: 100 },
];

/* ─── 裁切比例 ─── */
const ASPECT_PRESETS = [
  { label: '自由', value: undefined },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
];

interface ImageEditModalProps {
  imageUrl: string;
  /** url, sizePercent (10-100), keepOpen */
  onConfirm: (url: string, sizePercent: number, keepOpen: boolean) => void;
  onCancel: () => void;
}

export default function ImageEditModal({ imageUrl, onConfirm, onCancel }: ImageEditModalProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [sizePercent, setSizePercent] = useState(100);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<'size' | 'crop'>('size');

  const displayWidth = Math.round(naturalWidth * sizePercent / 100);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setNaturalWidth(e.currentTarget.naturalWidth);
  }, []);

  // ESC 關閉
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  // 裁切並上傳
  const cropAndUpload = useCallback(async (keepOpen: boolean) => {
    if (!imgRef.current || !completedCrop) return;

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    // 偵測是否為可能含透明的格式（PNG, WebP, GIF）
    const isPng = imageUrl.match(/\.png(\?|$)/i);
    const isWebp = imageUrl.match(/\.webp(\?|$)/i);
    const isGif = imageUrl.match(/\.gif(\?|$)/i);
    const hasAlpha = isPng || isWebp || isGif;
    const mimeType = hasAlpha ? 'image/png' : 'image/jpeg';
    const fileExt = hasAlpha ? 'png' : 'jpg';

    // Canvas → Blob（透明圖用 PNG，其餘用 JPEG）
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, hasAlpha ? undefined : 0.9),
    );
    if (!blob) return;

    setUploading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const formData = new FormData();
      formData.append('file', blob, `cropped.${fileExt}`);

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
      onConfirm(data.data.url, sizePercent, keepOpen);
    } catch (err) {
      alert(err instanceof Error ? err.message : '裁切上傳失敗');
    } finally {
      setUploading(false);
    }
  }, [completedCrop, sizePercent, onConfirm, imageUrl]);

  const handleConfirm = (keepOpen: boolean) => {
    if (tab === 'crop' && completedCrop && completedCrop.width > 0 && completedCrop.height > 0) {
      cropAndUpload(keepOpen);
    } else {
      onConfirm(imageUrl, sizePercent, keepOpen);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* 標題列 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">調整圖片</h3>
          <button
            onClick={onCancel}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 分頁切換 */}
        <div className="flex border-b border-gray-200 px-5">
          <button
            type="button"
            onClick={() => { setTab('size'); setCrop(undefined); setCompletedCrop(undefined); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'size' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            調整大小
          </button>
          <button
            type="button"
            onClick={() => setTab('crop')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'crop' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            裁切範圍
          </button>
        </div>

        {/* 圖片預覽 */}
        <div className="flex-1 overflow-auto p-5">
          <div className="flex justify-center bg-gray-50 rounded-lg p-4 mb-4">
            {tab === 'crop' ? (
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={aspect}
              >
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt="預覽"
                  onLoad={onImageLoad}
                  style={{ maxHeight: '400px', maxWidth: '100%' }}
                  crossOrigin="anonymous"
                />
              </ReactCrop>
            ) : (
              <img
                ref={imgRef}
                src={imageUrl}
                alt="預覽"
                onLoad={onImageLoad}
                style={{
                  maxHeight: '400px',
                  width: `${sizePercent}%`,
                  maxWidth: '100%',
                  objectFit: 'contain',
                }}
              />
            )}
          </div>

          {/* 裁切比例（裁切模式） */}
          {tab === 'crop' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">裁切比例</label>
              <div className="flex gap-2">
                {ASPECT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setAspect(preset.value);
                      setCrop(undefined);
                      setCompletedCrop(undefined);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      aspect === preset.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 顯示大小 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">顯示大小</label>
            <div className="flex gap-2 mb-3">
              {SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setSizePercent(preset.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    sizePercent === preset.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Slider */}
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={10}
                max={100}
                value={sizePercent}
                onChange={(e) => setSizePercent(Number(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex items-center gap-1.5 min-w-[100px]">
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={sizePercent}
                  onChange={(e) => {
                    const v = Math.min(100, Math.max(10, Number(e.target.value) || 10));
                    setSizePercent(v);
                  }}
                  className="w-14 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>

            {naturalWidth > 0 && (
              <div className="text-xs text-gray-400 mt-1.5">
                原始寬度 {naturalWidth}px → 顯示寬度約 {displayWidth}px
              </div>
            )}
          </div>
        </div>

        {/* 底部按鈕 */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => handleConfirm(true)}
            disabled={uploading}
            className="px-5 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-medium disabled:opacity-50"
          >
            {uploading ? '處理中...' : '插入並繼續'}
          </button>
          <button
            type="button"
            onClick={() => handleConfirm(false)}
            disabled={uploading}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            {uploading ? '處理中...' : '確認插入'}
          </button>
        </div>
      </div>
    </div>
  );
}
