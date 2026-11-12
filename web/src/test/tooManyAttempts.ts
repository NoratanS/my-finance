import { HttpResponse } from 'msw'
import type { Problem } from '@/test/sessionHandlers'

// The API's attempt-limit refusal, with a Retry-After when given the seconds to wait.
export const tooManyAttempts = (retryAfterSeconds?: number) =>
  HttpResponse.json<Problem>(
    {
      type: 'about:blank',
      title: 'Too many attempts. Try again in a few minutes.',
      status: 429,
    },
    {
      status: 429,
      headers:
        retryAfterSeconds === undefined
          ? {}
          : { 'Retry-After': String(retryAfterSeconds) },
    },
  )
