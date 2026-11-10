import { queryOptions } from '@tanstack/react-query'
import { api } from '@/api/client'

export const healthQueries = {
  status: () =>
    queryOptions({
      queryKey: ['health'],
      queryFn: async ({ signal }) => {
        const { data, response } = await api.GET('/api/health', { signal })
        if (!data) {
          throw new Error(`Health check failed: ${String(response.status)}`)
        }
        return data
      },
    }),
}
