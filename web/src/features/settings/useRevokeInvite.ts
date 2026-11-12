import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import type { components } from '@/api/schema'
import { inviteQueries } from '@/features/settings/inviteQueries'

type Invite = components['schemas']['Invite']

// Resolves to whether this call revoked it; false when it was already accepted or gone.
export function useRevokeInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (invite: Invite) => {
      const { response } = await api.DELETE('/api/invites/{id}', {
        params: { path: { id: invite.id } },
      })
      if (response.status === 404) return false
      if (!response.ok) throw new ApiError(response.status)
      return true
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: inviteQueries.all() }),
  })
}
