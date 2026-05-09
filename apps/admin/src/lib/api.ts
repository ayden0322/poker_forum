// SSR 用內部網路連 API，瀏覽器用公開 URL
const API_URL =
  typeof window === 'undefined'
    ? (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api')
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api');

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

// 同時間多個 401 只會觸發一次 refresh，其他人共用同一個 Promise
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = localStorage.getItem('admin_refreshToken');
      if (!refreshToken) return null;

      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;

      const json = (await res.json()) as {
        data: { accessToken: string; refreshToken: string };
      };
      localStorage.setItem('admin_accessToken', json.data.accessToken);
      localStorage.setItem('admin_refreshToken', json.data.refreshToken);
      return json.data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function clearAuthAndRedirect() {
  localStorage.removeItem('admin_accessToken');
  localStorage.removeItem('admin_refreshToken');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

/**
 * 管理後台共用 API 呼叫工具
 * - 自動從 localStorage 讀取 token 並帶入 Authorization header
 * - 收到 401 時自動用 refresh token 換新 access token 並重試一次
 * - refresh 失敗則清除 token 並導向 /login
 */
export async function adminApiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth, headers, ...rest } = options;
  const isBrowser = typeof window !== 'undefined';

  const isFormData = typeof FormData !== 'undefined' && rest.body instanceof FormData;

  const buildHeaders = (token: string | null): HeadersInit => {
    const h: Record<string, string> = {};
    if (!isFormData) h['Content-Type'] = 'application/json';
    if (!skipAuth && token) h['Authorization'] = `Bearer ${token}`;
    return { ...h, ...(headers as Record<string, string> | undefined) };
  };

  const initialToken = !skipAuth && isBrowser ? localStorage.getItem('admin_accessToken') : null;

  let res = await fetch(`${API_URL}${endpoint}`, {
    ...rest,
    headers: buildHeaders(initialToken),
  });

  if (res.status === 401 && !skipAuth && isBrowser) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await fetch(`${API_URL}${endpoint}`, {
        ...rest,
        headers: buildHeaders(newToken),
      });
    } else {
      clearAuthAndRedirect();
      throw new Error('登入逾時，請重新登入');
    }
  }

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({ message: '請求失敗' }))) as {
      message?: string;
    };
    throw new Error(errorBody.message || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}
