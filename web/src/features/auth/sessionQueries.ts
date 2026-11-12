import { queryOptions } from '@tanstack/react-query'
import { api, call } from '@/api/client'

export const sessionQueries = {
  current: () =>
    queryOptions({
      queryKey: ['session'],
      queryFn: ({ signal }) => call(api.GET('/api/session', { signal })),
    }),
}
