import { api, call } from '@/api/client'
import type { operations } from '@/api/schema'
import { useSessionMutation } from '@/features/auth/useSessionMutation'

export type PasswordChange = NonNullable<
  operations['updatePassword']['requestBody']
>['content']['application/json']

export function useChangePassword() {
  return useSessionMutation((change: PasswordChange) =>
    call(api.PATCH('/api/password', { body: change })),
  )
}
