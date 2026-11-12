import { queryOptions } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'

export const userQueries = {
  all: () => ['users'] as const,
  list: () =>
    queryOptions({
      queryKey: [...userQueries.all(), 'list'],
      queryFn: async ({ signal }) => {
        const { data, response } = await api.GET('/api/users', { signal })
        if (!data) throw new ApiError(response.status)
        return data
      },
    }),
}
