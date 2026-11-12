import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import type { operations } from '@/api/schema'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { signupQueries } from '@/features/signup/signupQueries'

export type NewAccount = NonNullable<
  operations['createSignup']['requestBody']
>['content']['application/json']

export function useSignup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (account: NewAccount) => {
      const { data, error, response } = await api.POST('/api/signup', {
        body: account,
      })
      if (!data) throw new ApiError(response.status, error)
      return data
    },
    onSuccess: (session) => {
      queryClient.setQueryData(sessionQueries.current().queryKey, session)
    },
    // A 404, or a 422 without field errors, means the invite changed state; reloading it shows which.
    onError: (error, account) => {
      if (
        error instanceof ApiError &&
        error.status !== 429 &&
        !error.problem?.errors
      ) {
        void queryClient.invalidateQueries(signupQueries.invite(account.token))
      }
    },
  })
}
