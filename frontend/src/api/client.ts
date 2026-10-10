// Thin fetch wrapper for the my-finance API.
//
// - Every request names the Active profile in the X-Profile-Id header: the remembered
//   Profile's id, or an empty value while none is chosen (docs/API.md "Active profile: one
//   header, resolved in one place"). No screen or hook attaches it; this module does.
// - Every non-2xx response is application/problem+json (RFC 9457) and is thrown
//   as an ApiError carrying the stable `type` slug and per-field `errors`.

import { forgetProfile, rememberedProfileId } from './activeProfile';

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
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/** The X-Profile-Id value for a request that names `profileId`: empty when no Profile is chosen. */
function profileHeader(profileId: number | null): string {
  return profileId === null ? '' : String(profileId);
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const profileId = rememberedProfileId();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Profile-Id': profileHeader(profileId),
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    await throwApiError(response, profileId);
  }

  return response.json() as Promise<T>;
}

/**
 * Parse a non-2xx response as RFC 9457 problem+json and throw it as ApiError.
 *
 * `409 no-active-profile` means the Profile the request named does not exist (any more), so
 * it is forgotten — unless another one has been chosen since the request was sent. The route
 * gates follow the remembered Profile and show the picker (App.tsx).
 */
async function throwApiError(response: Response, sentProfileId: number | null): Promise<never> {
  let problem: Record<string, unknown> = {};
  try {
    problem = await response.json();
  } catch {
    // Non-JSON error body; ApiError falls back to a generic message.
  }
  const error = new ApiError(response.status, problem);
  if (
    error.status === 409 &&
    error.type === '/errors/no-active-profile' &&
    rememberedProfileId() === sentProfileId
  ) {
    forgetProfile();
  }
  throw error;
}

export interface DownloadedFile {
  blob: Blob;
  filename: string;
}

/**
 * POST returning a file (backup export). The same header as api(), but a 2xx
 * body is kept as a Blob and the filename comes from the Content-Disposition
 * header. Non-2xx still parses as problem+json.
 */
export async function apiDownload(path: string, body: unknown): Promise<DownloadedFile> {
  const profileId = rememberedProfileId();
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Profile-Id': profileHeader(profileId),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwApiError(response, profileId);
  }
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  return { blob: await response.blob(), filename: match?.[1] ?? 'my-finance-backup.json' };
}

/**
 * POST multipart/form-data (backup restore). Content-Type is deliberately NOT
 * set — the browser must add it with the multipart boundary.
 */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const profileId = rememberedProfileId();
  const response = await fetch(path, {
    method: 'POST',
    headers: { Accept: 'application/json', 'X-Profile-Id': profileHeader(profileId) },
    body: form,
  });
  if (!response.ok) {
    await throwApiError(response, profileId);
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
