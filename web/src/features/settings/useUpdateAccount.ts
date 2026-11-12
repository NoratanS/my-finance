import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import type { operations } from '@/api/schema'
import { sessionQueries } from '@/features/auth/sessionQueries'

export type AccountChange = NonNullable<
  operations['updateAccount']['requestBody']
>['content']['application/json']

export function useUpdateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (change: AccountChange) => {
      const { data, error, response } = await api.PATCH('/api/account', {
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
