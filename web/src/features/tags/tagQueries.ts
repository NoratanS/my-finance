import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api, call } from '@/api/client'
import type { TagPeriod } from '@/features/tags/tagPeriods'

export const tagQueries = {
  all: () => ['tags'] as const,
  // This month is sent as no period, as a fresh visit asks; the last totals stay up while the next span loads.
  list: (period: TagPeriod = '1') =>
    queryOptions({
      queryKey: [...tagQueries.all(), 'list', period],
      queryFn: ({ signal }) =>
        call(
          api.GET('/api/tags', {
            params: { query: period === '1' ? {} : { period } },
            signal,
          }),
        ),
      placeholderData: keepPreviousData,
    }),
}
