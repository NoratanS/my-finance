import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { sessionQueries } from '@/features/auth/sessionQueries'

export interface Credentials {
  email: string
  password: string
}

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
