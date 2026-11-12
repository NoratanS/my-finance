import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { inviteQueries } from '@/features/settings/inviteQueries'

export function useCreateInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) => {
      const { data, error, response } = await api.POST('/api/invites', {
        body: { email },
      })
      if (!data) throw new ApiError(response.status, error)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: inviteQueries.all() }),
  })
}
