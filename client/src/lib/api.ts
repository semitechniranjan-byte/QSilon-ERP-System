let csrfToken = '';
export function setCsrf(t: string) { csrfToken = t; }

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string[]>, public details?: any) { super(message); }
}

async function request<T>(method: string, url: string, body?: unknown, isForm = false, retried = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['x-csrf-token'] = csrfToken;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Unable to reach the server. Check your connection and try again.');
  }
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 403 && data?.details?.code === 'CSRF') {
      // Session rotated: refresh token once and retry.
      const me = await fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json());
      setCsrf(me.csrfToken);
      if (!retried) return request<T>(method, url, body, isForm, true);
    }
    if (res.status === 403 && data?.details?.code === 'MUST_CHANGE_PASSWORD' && !location.pathname.startsWith('/change-password')) {
      location.href = '/change-password';
    }
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.fields, data?.details);
  }
  return data as T;
}

export const api = {
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T = any>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  del: <T = any>(url: string) => request<T>('DELETE', url),
  upload: async (file: File, purpose: string): Promise<{ id: string; name: string; mimeType: string }> => {
    const fd = new FormData();
    fd.append('purpose', purpose);
    fd.append('file', file);
    return request('POST', '/api/files', fd, true);
  },
};

/** Build a query string, skipping empty values. */
export function qs(params: Record<string, unknown>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
