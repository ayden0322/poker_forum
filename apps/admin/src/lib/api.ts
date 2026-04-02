// SSR 用內部網路連 API，瀏覽器用公開 URL
const API_URL =
  typeof window === 'undefined'
    ? (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api')
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api');

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

/**
 * 管理後台共用 API 呼叫工具
 * 自動從 localStorage 讀取 token 並帶入 Authorization header
 */
export async function adminApiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth, headers, ...rest } = options;

  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!skipAuth) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin_accessToken') : null;
    if (token) {
      authHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      ...authHeaders,
      ...headers,
    },
    ...rest,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ message: '請求失敗' })) as { message?: string };
    throw new Error(errorBody.message || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}
