// SSR 用內部網路連 API，瀏覽器用公開 URL
// 注意：NEXT_PUBLIC_* 是 build-time 寫死，正式環境 fallback 必須是公開 API URL
const PROD_FALLBACK = 'https://api.goboka.net/api';
const DEV_FALLBACK = 'http://localhost:4010/api';
const FALLBACK = process.env.NODE_ENV === 'production' ? PROD_FALLBACK : DEV_FALLBACK;
const API_URL =
  typeof window === 'undefined'
    ? (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || FALLBACK)
    : (process.env.NEXT_PUBLIC_API_URL || FALLBACK);

interface FetchOptions extends RequestInit {
  token?: string;
}

// 防止並發刷新 token
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return null;

    const data = await res.json() as { data: { accessToken: string; refreshToken: string } };
    localStorage.setItem('accessToken', data.data.accessToken);
    localStorage.setItem('refreshToken', data.data.refreshToken);
    // 廣播新 token，讓 AuthContext 同步狀態（否則用 context token 的呼叫仍會送過期 token）
    window.dispatchEvent(new CustomEvent('auth:token-refreshed', { detail: data.data.accessToken }));
    return data.data.accessToken;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { token, headers, ...rest } = options;

  const authToken = token ?? (typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null);

  const res = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...headers,
    },
    ...rest,
  });

  // 401 處理（僅限瀏覽器端）。涵蓋兩種情況，且只使用「本瀏覽器目前 session」的 token，
  // 不會跨 session 拿別人的 token 重試（Codex 複審 #4a）：
  //  1) 帶的是過期快取 token，但 localStorage 已被其他請求刷新成更新的 → 直接用較新的重試
  //  2) 連 localStorage 的 token 也過期 → 用 refresh token 刷新後重試
  if (res.status === 401 && typeof window !== 'undefined') {
    // (1) localStorage 有比這次更新的 token → 先用它重試，省一次刷新
    const stored = localStorage.getItem('accessToken');
    if (stored && stored !== authToken) {
      const retryRes = await fetch(`${API_URL}${endpoint}`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stored}`, ...headers },
        ...rest,
      });
      if (retryRes.ok) return retryRes.json() as Promise<T>;
      // 仍 401 → 落入刷新流程
    }

    // (2) 刷新 token（單例避免並發重複刷新）
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }

    const newToken = await refreshPromise;
    if (newToken) {
      const retryRes = await fetch(`${API_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
          ...headers,
        },
        ...rest,
      });

      if (!retryRes.ok) {
        throw await parseApiError(retryRes);
      }

      return retryRes.json() as Promise<T>;
    }

    // 刷新失敗，清除 token 並登出
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.dispatchEvent(new Event('auth:logout'));
  }

  if (!res.ok) {
    throw await parseApiError(res);
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  code?: string;
  status: number;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => ({}))) as {
    message?: string | { code?: string; message?: string };
    code?: string;
  };
  // NestJS ForbiddenException 傳 object 會包在 message 裡
  let code: string | undefined = body.code;
  let message = '請求失敗';
  if (typeof body.message === 'string') {
    message = body.message;
  } else if (body.message && typeof body.message === 'object') {
    code = body.message.code || code;
    message = body.message.message || message;
  }
  const err = new ApiError(message || `HTTP ${res.status}`, res.status, code);

  // 全域廣播手機驗證要求事件，讓 UI 攔截
  if (typeof window !== 'undefined' && code === 'PHONE_VERIFICATION_REQUIRED') {
    window.dispatchEvent(new CustomEvent('auth:phone-verification-required'));
  }
  return err;
}
