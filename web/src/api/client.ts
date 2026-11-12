import createClient from 'openapi-fetch'
import type { paths } from '@/api/schema'

// Same origin everywhere (Vite proxy in dev, Vercel rewrite in prod); absolute so Node's fetch parses it in tests.
export const api = createClient<paths>({ baseUrl: window.location.origin })

// A failed API call, so callers can branch on the status (401 → sign in, 429 → wait).
export class ApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`API request failed with ${String(status)}`)
    this.name = 'ApiError'
    this.status = status
  }
}

export const isUnauthorized = (error: unknown) =>
  error instanceof ApiError && error.status === 401
