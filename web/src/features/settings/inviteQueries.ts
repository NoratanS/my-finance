import { queryOptions } from '@tanstack/react-query'
import { api, call } from '@/api/client'

export const inviteQueries = {
  all: () => ['invites'] as const,
  pending: () =>
    queryOptions({
      queryKey: [...inviteQueries.all(), 'pending'],
      queryFn: ({ signal }) => call(api.GET('/api/invites', { signal })),
    }),
}
