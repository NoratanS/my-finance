// Thin fetch wrapper for the my-finance API.
//
// - credentials: 'include' so the session cookie rides along (dev server proxies
//   /api to the backend on the same origin, so this is belt-and-braces).
// - Mutations echo the readable XSRF-TOKEN cookie in the X-XSRF-TOKEN header
//   (Spring Security CookieCsrfTokenRepository).
// - Every non-2xx response is application/problem+json (RFC 9457) and is thrown
//   as an ApiError carrying the stable `type` slug and per-field `errors`.

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  /** Stable slug, e.g. "/errors/category-name-taken". */
  type: string;
  title: string;
  detail: string;
  errors?: FieldError[];
  /** Extension members (maxDepth, transactionCount, ...). */
  extra: Record<string, unknown>;

  constructor(status: number, problem: Record<string, unknown>) {
    const detail =
      typeof problem.detail === 'string' ? problem.detail : `Request failed with status ${status}.`;
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.type = typeof problem.type === 'string' ? problem.type : '/errors/unknown';
    this.title = typeof problem.title === 'string' ? problem.title : 'Error';
    this.detail = detail;
    if (Array.isArray(problem.errors)) {
      this.errors = problem.errors as FieldError[];
    }
    this.extra = problem;
  }

  /** Message for one form field from a 400 validation-failed, if present. */
  fieldMessage(field: string): string | undefined {
    return this.errors?.find((e) => e.field === field)?.message;
  }
}

function readCookie(name: string): string | undefined {
  const match = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.substring(name.length + 1)) : undefined;
}

/**
 * Fired on responses the app handles globally: 401 (session gone -> auth
 * screen) and 409 no-active-profile (-> profile picker). App.tsx listens.
 */
export const AUTH_EVENT = 'my-finance:auth-error';

export interface AuthErrorDetail {
  kind: 'unauthenticated' | 'no-active-profile';
}

function emitAuthError(kind: AuthErrorDetail['kind']) {
  window.dispatchEvent(new CustomEvent<AuthErrorDetail>(AUTH_EVENT, { detail: { kind } }));
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Suppress the global 401 redirect (used by auth endpoints themselves). */
  skipAuthEvent?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET') {
    const token = readCookie('XSRF-TOKEN');
    if (token) headers['X-XSRF-TOKEN'] = token;
  }

  const response = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    let problem: Record<string, unknown> = {};
    try {
      problem = await response.json();
    } catch {
      // Non-JSON error body; ApiError falls back to a generic message.
    }
    const error = new ApiError(response.status, problem);
    if (!options.skipAuthEvent) {
      if (error.status === 401) emitAuthError('unauthenticated');
      if (error.status === 409 && error.type === '/errors/no-active-profile') {
        emitAuthError('no-active-profile');
      }
    }
    throw error;
  }

  return response.json() as Promise<T>;
}

export function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
