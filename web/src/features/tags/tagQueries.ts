import {
  keepPreviousData,
  partialMatchKey,
  queryOptions,
} from '@tanstack/react-query'
import { api, call, isNotFound } from '@/api/client'
import {
  type TagPeriod,
  tagPeriodQuery,
  thisMonth,
} from '@/features/tags/tagPeriods'

export const tagQueries = {
  all: () => ['tags'] as const,
  // This month is sent as no period, as a fresh visit asks; the last totals stay up while the next span loads.
  list: (period: TagPeriod = thisMonth) =>
    queryOptions({
      queryKey: [...tagQueries.all(), 'list', period],
      queryFn: ({ signal }) =>
        call(
          api.GET('/api/tags', {
            params: { query: tagPeriodQuery(period) },
            signal,
          }),
        ),
      placeholderData: keepPreviousData,
    }),
  // One tag's details over any period.
  detailsOf: (id: number) => [...tagQueries.all(), 'detail', id] as const,
  // A tag deleted elsewhere is a 404: the list reloads without it. The panel keeps its last details only for the same tag.
  detail: (id: number, period: TagPeriod = thisMonth) =>
    queryOptions({
      queryKey: [...tagQueries.detailsOf(id), period],
      queryFn: ({ signal, client }) =>
        call(
          api.GET('/api/tags/{id}', {
            params: { path: { id }, query: tagPeriodQuery(period) },
            signal,
          }),
        ).catch((error: unknown) => {
          if (isNotFound(error))
            void client.invalidateQueries({
              queryKey: [...tagQueries.all(), 'list'],
            })
          throw error
        }),
      placeholderData: (previous, previousQuery) =>
        previousQuery &&
        partialMatchKey(previousQuery.queryKey, tagQueries.detailsOf(id))
          ? previous
          : undefined,
    }),
}
