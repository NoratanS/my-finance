import { useMutation } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'

export function useCreateResetLink() {
  return useMutation({
    mutationFn: async (userId: number) => {
      const { data, error, response } = await api.POST(
        '/api/users/{user_id}/reset_links',
        {
          params: { path: { user_id: userId } },
          // No body, so openapi-fetch sends no type; the API only takes JSON (its login-CSRF guard).
          headers: { 'Content-Type': 'application/json' },
        },
      )
      if (!data) throw new ApiError(response.status, error)
      return data
    },
  })
}
