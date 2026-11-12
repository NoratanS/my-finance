import { queryOptions } from '@tanstack/react-query'
import { api, call } from '@/api/client'

export const userQueries = {
  all: () => ['users'] as const,
  list: () =>
    queryOptions({
      queryKey: [...userQueries.all(), 'list'],
      queryFn: ({ signal }) => call(api.GET('/api/users', { signal })),
    }),
}
