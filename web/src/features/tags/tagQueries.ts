import { queryOptions } from '@tanstack/react-query'
import { api, call } from '@/api/client'

export const tagQueries = {
  all: () => ['tags'] as const,
  list: () =>
    queryOptions({
      queryKey: [...tagQueries.all(), 'list'],
      queryFn: async ({ signal }) =>
        (await call(api.GET('/api/tags', { signal }))).data,
    }),
}
