/**
 * GIF 搜尋工具 — 呼叫後端代理（後端再打 Giphy API，避免 key 外洩）
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://api.goboka.net/api' : 'http://localhost:4010/api');

export interface TenorGif {
  id: string;
  title: string;
  media_formats: {
    gif: { url: string; dims: [number, number] };
    tinygif: { url: string; dims: [number, number] };
  };
}

export interface TenorResponse {
  results: TenorGif[];
  next: string;
}

function toTenorGif(item: { id: string; title: string; previewUrl: string; url: string; width: number; height: number }): TenorGif {
  return {
    id: item.id,
    title: item.title,
    media_formats: {
      gif: { url: item.url, dims: [item.width, item.height] },
      tinygif: { url: item.previewUrl, dims: [item.width, item.height] },
    },
  };
}

async function apiFetch(path: string): Promise<TenorResponse> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error('GIF 搜尋失敗');
  const json = await res.json() as { data: Parameters<typeof toTenorGif>[0][] };
  return {
    results: json.data.map(toTenorGif),
    next: '',
  };
}

/** 搜尋 GIF */
export async function searchGifs(query: string, limit = 20, offset?: string): Promise<TenorResponse> {
  const off = offset ? parseInt(offset, 10) : 0;
  return apiFetch(`/gifs/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${off}`);
}

/** 取得熱門 GIF */
export async function getFeaturedGifs(limit = 20, offset?: string): Promise<TenorResponse> {
  const off = offset ? parseInt(offset, 10) : 0;
  return apiFetch(`/gifs/trending?limit=${limit}&offset=${off}`);
}
