const TENOR_API_KEY = process.env.NEXT_PUBLIC_TENOR_API_KEY || '';
const TENOR_BASE = 'https://tenor.googleapis.com/v2';
const CLIENT_KEY = 'goboka-forum';

export interface TenorGif {
  id: string;
  title: string;
  media_formats: {
    gif: { url: string; dims: [number, number]; size: number };
    tinygif: { url: string; dims: [number, number]; size: number };
    mediumgif?: { url: string; dims: [number, number]; size: number };
  };
}

export interface TenorResponse {
  results: TenorGif[];
  next: string;
}

async function tenorFetch(endpoint: string, params: Record<string, string>): Promise<TenorResponse> {
  const query = new URLSearchParams({
    key: TENOR_API_KEY,
    client_key: CLIENT_KEY,
    ...params,
  });
  const res = await fetch(`${TENOR_BASE}/${endpoint}?${query}`);
  if (!res.ok) throw new Error('Tenor API 請求失敗');
  return res.json();
}

/** 搜尋 GIF */
export async function searchGifs(query: string, limit = 20, pos?: string): Promise<TenorResponse> {
  const params: Record<string, string> = {
    q: query,
    limit: String(limit),
    media_filter: 'gif,tinygif',
    locale: 'zh_TW',
  };
  if (pos) params.pos = pos;
  return tenorFetch('search', params);
}

/** 取得熱門 GIF */
export async function getFeaturedGifs(limit = 20, pos?: string): Promise<TenorResponse> {
  const params: Record<string, string> = {
    limit: String(limit),
    media_filter: 'gif,tinygif',
    locale: 'zh_TW',
  };
  if (pos) params.pos = pos;
  return tenorFetch('featured', params);
}
