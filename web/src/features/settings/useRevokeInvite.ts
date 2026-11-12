import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import type { components } from '@/api/schema'
import { inviteQueries } from '@/features/settings/inviteQueries'

type Invite = components['schemas']['Invite']

export function useRevokeInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (invite: Invite) => {
      const { response } = await api.DELETE('/api/invites/{id}', {
        params: { path: { id: invite.id } },
      })
      // A 404 means it's already gone, which is what revoking wants.
      if (!response.ok && response.status !== 404) {
        throw new ApiError(response.status)
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: inviteQueries.all() }),
  })
}
