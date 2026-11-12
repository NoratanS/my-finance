import { queryOptions } from '@tanstack/react-query'
import { api, call } from '@/api/client'

export const passwordResetQueries = {
  link: (token: string) =>
    queryOptions({
      queryKey: ['password-resets', token],
      queryFn: ({ signal }) =>
        call(
          api.GET('/api/password_reset', {
            params: { query: { token } },
            signal,
          }),
        ),
    }),
}
