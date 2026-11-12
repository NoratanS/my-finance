import createClient from 'openapi-fetch'
import type { components, paths } from '@/api/schema'

// Same origin everywhere (Vite proxy in dev, Vercel rewrite in prod); absolute so Node's fetch parses it in tests.
export const api = createClient<paths>({ baseUrl: window.location.origin })

type Problem = components['schemas']['Problem']

// A failed API call, so callers can branch on the status (401 → sign in, 429 → wait) and map field errors.
export class ApiError extends Error {
  readonly status: number
  readonly problem: Problem | undefined

  constructor(status: number, problem?: Problem) {
    super(`API request failed with ${String(status)}`)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }
}

export const isUnauthorized = (error: unknown) =>
  error instanceof ApiError && error.status === 401

export const isRateLimited = (error: unknown) =>
  error instanceof ApiError && error.status === 429

// No answer, or a server error: nothing the user typed is wrong.
export const isUnreachable = (error: unknown) =>
  !(error instanceof ApiError) || error.status >= 500
