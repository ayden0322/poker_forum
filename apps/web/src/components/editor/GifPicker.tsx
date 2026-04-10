'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { searchGifs, getFeaturedGifs, type TenorGif } from '@/lib/tenor';
import { GIF_CATEGORIES } from '@/data/defaultGifs';

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

export default function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('trending');
  const [gifs, setGifs] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextPos, setNextPos] = useState<string>('');
  const [hasMore, setHasMore] = useState(false);

  // 點擊外部關閉
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // ESC 關閉
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // 載入 GIF
  const loadGifs = useCallback(async (searchQuery: string, append = false, pos?: string) => {
    setLoading(true);
    try {
      const res = searchQuery
        ? await searchGifs(searchQuery, 20, pos)
        : await getFeaturedGifs(20, pos);

      setGifs((prev) => append ? [...prev, ...res.results] : res.results);
      setNextPos(res.next || '');
      setHasMore(!!res.next && res.results.length >= 20);
    } catch {
      // API 失敗時靜默處理
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始載入 + 分類切換
  useEffect(() => {
    const category = GIF_CATEGORIES.find((c) => c.id === activeCategory);
    const searchTerm = category?.searchTerm || '';
    setQuery('');
    loadGifs(searchTerm);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [activeCategory, loadGifs]);

  // 搜尋 debounce
  const handleSearch = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim()) {
        setActiveCategory('');
        loadGifs(value.trim());
      } else {
        setActiveCategory('trending');
      }
    }, 400);
  };

  // 載入更多
  const loadMore = () => {
    if (loading || !nextPos) return;
    const category = GIF_CATEGORIES.find((c) => c.id === activeCategory);
    const searchTerm = query.trim() || category?.searchTerm || '';
    loadGifs(searchTerm, true, nextPos);
  };

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 flex flex-col"
      style={{ width: '360px', maxHeight: '480px' }}
    >
      {/* 搜尋框 */}
      <div className="p-3 border-b border-gray-100">
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="搜尋 GIF..."
          className="w-full px-3 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
      </div>

      {/* 分類標籤 */}
      <div className="flex gap-1 px-3 py-2 border-b border-gray-100 overflow-x-auto scrollbar-hide">
        {GIF_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => {
              setActiveCategory(cat.id);
              setQuery('');
            }}
            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              activeCategory === cat.id
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {/* GIF 網格 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2" style={{ maxHeight: '340px' }}>
        {gifs.length === 0 && !loading && (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            {query ? '找不到相關 GIF' : '載入中...'}
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          {gifs.map((gif) => (
            <button
              key={gif.id}
              type="button"
              onClick={() => onSelect(gif.media_formats.gif.url)}
              className="relative rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-shadow bg-gray-100 cursor-pointer"
              style={{
                aspectRatio: `${gif.media_formats.tinygif.dims[0]} / ${gif.media_formats.tinygif.dims[1]}`,
              }}
            >
              <img
                src={gif.media_formats.tinygif.url}
                alt={gif.title || 'GIF'}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>

        {/* 載入更多 */}
        {hasMore && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="w-full mt-2 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? '載入中...' : '載入更多'}
          </button>
        )}

        {loading && gifs.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Tenor 品牌歸屬 */}
      <div className="px-3 py-1.5 border-t border-gray-100 text-center">
        <span className="text-[10px] text-gray-400">Powered by Tenor</span>
      </div>
    </div>
  );
}
