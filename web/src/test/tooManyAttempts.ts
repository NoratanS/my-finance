import { HttpResponse } from 'msw'
import type { Problem } from '@/test/sessionHandlers'

// The API's attempt-limit refusal; pass a Retry-After header to say how long to wait.
export const tooManyAttempts = (headers: Record<string, string> = {}) =>
  HttpResponse.json<Problem>(
    {
      type: 'about:blank',
      title: 'Too many attempts. Try again in a few minutes.',
      status: 429,
    },
    { status: 429, headers },
  )
