import { queryOptions } from '@tanstack/react-query'
import { api, call } from '@/api/client'

export const signupQueries = {
  invite: (token: string) =>
    queryOptions({
      queryKey: ['signups', token],
      queryFn: ({ signal }) =>
        call(api.GET('/api/signup', { params: { query: { token } }, signal })),
    }),
}
