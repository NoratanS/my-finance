import { queryOptions } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'

export const inviteQueries = {
  all: () => ['invites'] as const,
  pending: () =>
    queryOptions({
      queryKey: [...inviteQueries.all(), 'pending'],
      queryFn: async ({ signal }) => {
        const { data, response } = await api.GET('/api/invites', { signal })
        if (!data) throw new ApiError(response.status)
        return data
      },
    }),
}
