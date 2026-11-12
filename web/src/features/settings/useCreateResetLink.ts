import { useMutation } from '@tanstack/react-query'
import { api, call } from '@/api/client'

export function useCreateResetLink() {
  return useMutation({
    mutationFn: (userId: number) =>
      call(
        api.POST('/api/users/{user_id}/reset_links', {
          params: { path: { user_id: userId } },
        }),
      ),
  })
}
