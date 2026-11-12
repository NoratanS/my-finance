import { useQueryClient } from '@tanstack/react-query'
import { api, isOwnedRefusal } from '@/api/client'
import type { operations } from '@/api/schema'
import { useSessionMutation } from '@/features/auth/useSessionMutation'
import { passwordResetQueries } from '@/features/password-reset/passwordResetQueries'

export type NewPassword = NonNullable<
  operations['updatePasswordReset']['requestBody']
>['content']['application/json']

// A 404 means the link died meanwhile; reloading it shows the dead-link card.
export const passwordResetRefusals = [404] as const

export function useResetPassword() {
  const queryClient = useQueryClient()
  return useSessionMutation(
    (newPassword: NewPassword) =>
      api.PATCH('/api/password_reset', { body: newPassword }),
    {
      signsIn: true,
      onError: (error, newPassword) => {
        if (isOwnedRefusal(error, passwordResetRefusals)) {
          void queryClient.invalidateQueries(
            passwordResetQueries.link(newPassword.token),
          )
        }
      },
    },
  )
}
