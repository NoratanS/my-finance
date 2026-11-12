import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import type { operations } from '@/api/schema'
import { sessionQueries } from '@/features/auth/sessionQueries'

export type PasswordChange = NonNullable<
  operations['updatePassword']['requestBody']
>['content']['application/json']

export function useChangePassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (change: PasswordChange) => {
      const { data, error, response } = await api.PATCH('/api/password', {
        body: change,
      })
      if (!data) throw new ApiError(response.status, error)
      return data
    },
    onSuccess: (session) => {
      queryClient.setQueryData(sessionQueries.current().queryKey, session)
    },
  })
}
