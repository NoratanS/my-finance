import { api } from '@/api/client'
import type { operations } from '@/api/schema'
import { useSessionMutation } from '@/features/auth/useSessionMutation'

export type AccountChange = NonNullable<
  operations['updateAccount']['requestBody']
>['content']['application/json']

export function useUpdateAccount() {
  return useSessionMutation((change: AccountChange) =>
    api.PATCH('/api/account', { body: change }),
  )
}
