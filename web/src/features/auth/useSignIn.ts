import { api, call } from '@/api/client'
import type { operations } from '@/api/schema'
import { useSessionMutation } from '@/features/auth/useSessionMutation'

export type Credentials = NonNullable<
  operations['createSession']['requestBody']
>['content']['application/json']

export function useSignIn() {
  return useSessionMutation(
    (credentials: Credentials) =>
      call(api.POST('/api/session', { body: credentials })),
    { signsIn: true },
  )
}
