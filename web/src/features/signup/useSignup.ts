import { useQueryClient } from '@tanstack/react-query'
import { api, call, isOwnedRefusal, type RequestBody } from '@/api/client'
import { useSessionMutation } from '@/features/auth/useSessionMutation'
import { signupQueries } from '@/features/signup/signupQueries'

export type NewAccount = RequestBody<'createSignup'>

// A 404, or a 422 without field errors, means the invite changed state; reloading it shows which.
export const signupRefusals = [404, 422] as const

export function useSignup() {
  const queryClient = useQueryClient()
  return useSessionMutation(
    (account: NewAccount) => call(api.POST('/api/signup', { body: account })),
    {
      signsIn: true,
      onError: (error, account) => {
        if (isOwnedRefusal(error, signupRefusals)) {
          void queryClient.invalidateQueries(
            signupQueries.invite(account.token),
          )
        }
      },
    },
  )
}
