import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, call } from '@/api/client'
import { inviteQueries } from '@/features/settings/inviteQueries'

export function useCreateInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (email: string) =>
      call(api.POST('/api/invites', { body: { email } })),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: inviteQueries.all() }),
  })
}
