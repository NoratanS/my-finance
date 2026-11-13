import { queryOptions } from '@tanstack/react-query'
import { api, call } from '@/api/client'

export const transactionQueries = {
  all: () => ['transactions'] as const,
  // This month, newest first; page 1 sends no page, as a fresh visit does.
  list: (page: number) =>
    queryOptions({
      queryKey: [...transactionQueries.all(), 'list', { page }],
      queryFn: ({ signal }) =>
        call(
          api.GET('/api/transactions', {
            params: { query: page > 1 ? { page } : {} },
            signal,
          }),
        ),
    }),
}
