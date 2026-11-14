import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api, call } from '@/api/client'
import type { components } from '@/api/schema'

type TagPeriod = components['schemas']['TagPeriod']

export const tagQueries = {
  all: () => ['tags'] as const,
  // No period is this month, as the API defaults; the last totals stay up while the next span loads.
  list: (period?: TagPeriod) =>
    queryOptions({
      queryKey: [...tagQueries.all(), 'list', period ?? '1'],
      queryFn: ({ signal }) =>
        call(
          api.GET('/api/tags', {
            params: { query: period ? { period } : {} },
            signal,
          }),
        ),
      placeholderData: keepPreviousData,
    }),
}
