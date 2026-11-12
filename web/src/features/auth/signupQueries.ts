import { queryOptions } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'

export const signupQueries = {
  invite: (token: string) =>
    queryOptions({
      queryKey: ['signups', token],
      queryFn: async ({ signal }) => {
        const { data, response } = await api.GET('/api/signups/{token}', {
          params: { path: { token } },
          signal,
        })
        if (!data) throw new ApiError(response.status)
        return data
      },
    }),
}
