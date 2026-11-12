import { queryOptions } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'

export const passwordResetQueries = {
  link: (token: string) =>
    queryOptions({
      queryKey: ['password-resets', token],
      queryFn: async ({ signal }) => {
        const { data, response } = await api.GET('/api/password_reset', {
          params: { query: { token } },
          signal,
        })
        if (!data) throw new ApiError(response.status)
        return data
      },
    }),
}
