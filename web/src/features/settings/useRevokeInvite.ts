import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, call, isNotFound } from '@/api/client'
import type { components } from '@/api/schema'
import { inviteQueries } from '@/features/settings/inviteQueries'

type Invite = components['schemas']['Invite']

// Resolves to whether this call revoked it; false when it was already accepted or gone.
export function useRevokeInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (invite: Invite) => {
      try {
        await call(
          api.DELETE('/api/invites/{id}', {
            params: { path: { id: invite.id } },
          }),
        )
        return true
      } catch (error) {
        if (isNotFound(error)) return false
        throw error
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: inviteQueries.all() }),
  })
}
