import { queryOptions } from '@tanstack/react-query'
import { api, call } from '@/api/client'

export const tagQueries = {
  all: () => ['tags'] as const,
  // The API sorts them A–Z ignoring case, so they show in its order.
  list: () =>
    queryOptions({
      queryKey: [...tagQueries.all(), 'list'],
      queryFn: async ({ signal }) =>
        (await call(api.GET('/api/tags', { signal }))).data,
    }),
}
