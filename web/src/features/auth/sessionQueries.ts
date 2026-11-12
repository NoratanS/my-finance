import { queryOptions } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'

export const sessionQueries = {
  current: () =>
    queryOptions({
      queryKey: ['session'],
      queryFn: async ({ signal }) => {
        const { data, response } = await api.GET('/api/session', { signal })
        if (!data) throw new ApiError(response.status)
        return data
      },
    }),
}
