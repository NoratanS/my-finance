import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import type { operations } from '@/api/schema'
import { useSessionMutation } from '@/features/auth/useSessionMutation'
import { passwordResetQueries } from '@/features/password-reset/passwordResetQueries'

export type NewPassword = NonNullable<
  operations['updatePasswordReset']['requestBody']
>['content']['application/json']

export function useResetPassword() {
  const queryClient = useQueryClient()
  return useSessionMutation(
    (newPassword: NewPassword) =>
      api.PATCH('/api/password_reset', { body: newPassword }),
    {
      // A 404 means the link died meanwhile; reloading it shows the dead-link card.
      onError: (error, newPassword) => {
        if (error instanceof ApiError && error.status === 404) {
          void queryClient.invalidateQueries(
            passwordResetQueries.link(newPassword.token),
          )
        }
      },
    },
  )
}
