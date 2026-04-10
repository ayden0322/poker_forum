import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyGif {
  id: string;
  title: string;
  images: {
    original: GiphyImage;
    fixed_height: GiphyImage;
    fixed_height_small: GiphyImage;
    downsized: GiphyImage & { size: string };
  };
}

export interface GifItem {
  id: string;
  title: string;
  previewUrl: string;   // 縮圖（fixed_height_small）
  url: string;          // 插入用（fixed_height）
  width: number;
  height: number;
}

interface CacheEntry {
  data: GifItem[];
  expireAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 小時

@Injectable()
export class GifsService {
  private readonly logger = new Logger(GifsService.name);
  private readonly apiKey: string;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GIPHY_API_KEY', '');
  }

  async search(query: string, offset = 0, limit = 20): Promise<GifItem[]> {
    const cacheKey = `search:${query}:${offset}:${limit}`;
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
      api_key: this.apiKey,
      q: query,
      limit: String(limit),
      offset: String(offset),
      rating: 'g',
      lang: 'zh-TW',
    });

    const data = await this.fetchGiphy(`https://api.giphy.com/v1/gifs/search?${params}`);
    this.setCache(cacheKey, data);
    return data;
  }

  async trending(offset = 0, limit = 20): Promise<GifItem[]> {
    const cacheKey = `trending:${offset}:${limit}`;
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
      api_key: this.apiKey,
      limit: String(limit),
      offset: String(offset),
      rating: 'g',
    });

    const data = await this.fetchGiphy(`https://api.giphy.com/v1/gifs/trending?${params}`);
    this.setCache(cacheKey, data);
    return data;
  }

  private async fetchGiphy(url: string): Promise<GifItem[]> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Giphy API 錯誤: ${res.status}`);
    const json = await res.json() as { data: GiphyGif[] };
    return json.data.map((g) => ({
      id: g.id,
      title: g.title,
      previewUrl: g.images.fixed_height_small.url,
      url: g.images.fixed_height.url,
      width: parseInt(g.images.fixed_height.width, 10),
      height: parseInt(g.images.fixed_height.height, 10),
    }));
  }

  private getCache(key: string): GifItem[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expireAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache(key: string, data: GifItem[]): void {
    this.cache.set(key, { data, expireAt: Date.now() + CACHE_TTL_MS });
  }
}
