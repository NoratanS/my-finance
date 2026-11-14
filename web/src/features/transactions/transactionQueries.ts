import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api, call } from '@/api/client'
import {
  filterParams,
  type TransactionFilters,
} from '@/features/transactions/transactionFilters'

export const transactionQueries = {
  all: () => ['transactions'] as const,
  // Only the filters set are sent, as a fresh visit sends none; the last page stays up while the next loads.
  list: (filters: TransactionFilters) =>
    queryOptions({
      queryKey: [...transactionQueries.all(), 'list', filterParams(filters)],
      queryFn: ({ signal }) =>
        call(
          api.GET('/api/transactions', {
            params: { query: filterParams(filters) },
            signal,
          }),
        ),
      placeholderData: keepPreviousData,
    }),
  // Under all(), so a save that adds a month refreshes the period select too.
  months: () =>
    queryOptions({
      queryKey: [...transactionQueries.all(), 'months'],
      queryFn: ({ signal }) =>
        call(api.GET('/api/transaction_months', { signal })),
    }),
}
