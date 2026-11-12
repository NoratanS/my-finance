import { useQueryClient } from '@tanstack/react-query'
import { api, call, isOwnedRefusal, type RequestBody } from '@/api/client'
import { useSessionMutation } from '@/features/auth/useSessionMutation'
import { passwordResetQueries } from '@/features/password-reset/passwordResetQueries'

export type NewPassword = RequestBody<'updatePasswordReset'>

// A 404 means the link died meanwhile; reloading it shows the dead-link card.
export const passwordResetRefusals = [404] as const

export function useResetPassword() {
  const queryClient = useQueryClient()
  return useSessionMutation(
    (newPassword: NewPassword) =>
      call(api.PATCH('/api/password_reset', { body: newPassword })),
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
