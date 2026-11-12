import { http, HttpResponse } from 'msw'
import type { components } from '@/api/schema'

export type Session = components['schemas']['Session']
export type Problem = components['schemas']['Problem']

export const signedInAs = (session: Partial<Session> = {}) =>
  http.get('/api/session', () =>
    HttpResponse.json<Session>({
      email: 'marta@example.com',
      admin: false,
      currency: 'PLN',
      ...session,
    }),
  )

export const signedOut = () =>
  http.get('/api/session', () =>
    HttpResponse.json<Problem>(
      { type: 'about:blank', title: 'Sign in to continue', status: 401 },
      { status: 401 },
    ),
  )
