import createClient from 'openapi-fetch'
import type { components, operations, paths } from '@/api/schema'

// Same origin everywhere (Vite proxy in dev, Vercel rewrite in prod); absolute so Node's fetch parses it in tests.
// Always JSON, even with no body: the API only takes JSON (its login-CSRF guard).
export const api = createClient<paths>({
  baseUrl: window.location.origin,
  headers: { 'Content-Type': 'application/json' },
})

type Problem = components['schemas']['Problem']

// The JSON body an operation takes, by its operationId.
export type RequestBody<Op extends keyof operations> = NonNullable<
  operations[Op]['requestBody']
>['content']['application/json']

// A failed API call, so callers can branch on the status (401 → sign in, 429 → wait) and map field errors.
export class ApiError extends Error {
  readonly status: number
  readonly problem: Problem | undefined
  // Seconds the API asks you to wait (its Retry-After), when it says.
  readonly retryAfter: number | undefined

  constructor(status: number, problem?: Problem, retryAfter?: number) {
    super(`API request failed with ${String(status)}`)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
    this.retryAfter = retryAfter
  }
}

// The refusals callers name; status numbers stay in this file.
export const status = {
  unauthorized: 401,
  notFound: 404,
  unprocessable: 422,
  tooManyRequests: 429,
} as const

// Every call goes through here: its data, or an ApiError with the problem. Keyed on `ok`, since a 204 has no data.
export async function call<T>(
  request: Promise<{ data?: T; error?: Problem; response: Response }>,
): Promise<T> {
  const { data, error, response } = await request
  if (!response.ok)
    throw new ApiError(response.status, error, retryAfter(response))
  return data as T
}

// Positive whole seconds only; no header, an HTTP date or anything else leaves the wait unknown.
function retryAfter(response: Response) {
  const seconds = Number(response.headers.get('Retry-After'))
  return Number.isInteger(seconds) && seconds > 0 ? seconds : undefined
}

export const isUnauthorized = (error: unknown) =>
  error instanceof ApiError && error.status === status.unauthorized

export const isNotFound = (error: unknown) =>
  error instanceof ApiError && error.status === status.notFound

export const isRateLimited = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === status.tooManyRequests

// A refusal the page answers itself (a state card, a notice): it carries no field errors.
export const isOwnedRefusal = (error: unknown, owns: readonly number[]) =>
  error instanceof ApiError &&
  owns.includes(error.status) &&
  !error.problem?.errors

// No answer, or a server error: nothing the user typed is wrong.
export const isUnreachable = (error: unknown) =>
  !(error instanceof ApiError) || error.status >= 500
