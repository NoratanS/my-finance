import createClient from 'openapi-fetch'
import type { components, paths } from '@/api/schema'

// Same origin everywhere (Vite proxy in dev, Vercel rewrite in prod); absolute so Node's fetch parses it in tests.
// Always JSON, even with no body: the API only takes JSON (its login-CSRF guard).
export const api = createClient<paths>({
  baseUrl: window.location.origin,
  headers: { 'Content-Type': 'application/json' },
})

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

// Every call goes through here: its data, or an ApiError with the problem. Keyed on `ok`, since a 204 has no data.
export async function call<T>(
  request: Promise<{ data?: T; error?: Problem; response: Response }>,
): Promise<T> {
  const { data, error, response } = await request
  if (!response.ok) throw new ApiError(response.status, error)
  return data as T
}

export const isUnauthorized = (error: unknown) =>
  error instanceof ApiError && error.status === 401

export const isNotFound = (error: unknown) =>
  error instanceof ApiError && error.status === 404

export const isRateLimited = (error: unknown) =>
  error instanceof ApiError && error.status === 429

// A refusal the page answers itself (a state card, a notice): it carries no field errors.
export const isOwnedRefusal = (error: unknown, owns: readonly number[]) =>
  error instanceof ApiError &&
  owns.includes(error.status) &&
  !error.problem?.errors

// No answer, or a server error: nothing the user typed is wrong.
export const isUnreachable = (error: unknown) =>
  !(error instanceof ApiError) || error.status >= 500
