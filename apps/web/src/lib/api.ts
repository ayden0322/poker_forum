// SSR 用內部網路連 API，瀏覽器用公開 URL
const API_URL =
  typeof window === 'undefined'
    ? (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api')
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api');

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

  // 401 時嘗試刷新 token 並重試（僅限瀏覽器端）
  if (res.status === 401 && typeof window !== 'undefined' && !options.token) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }

    const newToken = await refreshPromise;
    if (newToken) {
      // 用新 token 重試請求
      const retryRes = await fetch(`${API_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
          ...headers,
        },
        ...rest,
      });

      if (!retryRes.ok) {
        const errorBody = await retryRes.json().catch(() => ({ message: '請求失敗' })) as { message?: string };
        throw new Error(errorBody.message || `HTTP ${retryRes.status}`);
      }

      return retryRes.json() as Promise<T>;
    }

    // 刷新失敗，清除 token 並登出
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.dispatchEvent(new Event('auth:logout'));
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ message: '請求失敗' })) as { message?: string };
    throw new Error(errorBody.message || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}
