import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import type { operations } from '@/api/schema'
import { sessionQueries } from '@/features/auth/sessionQueries'

export type Credentials = NonNullable<
  operations['createSession']['requestBody']
>['content']['application/json']

export function useSignIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (credentials: Credentials) => {
      const { data, response } = await api.POST('/api/session', {
        body: credentials,
      })
      if (!data) throw new ApiError(response.status)
      return data
    },
    onSuccess: (session) => {
      queryClient.setQueryData(sessionQueries.current().queryKey, session)
    },
  })
}
