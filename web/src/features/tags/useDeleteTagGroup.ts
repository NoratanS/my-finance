import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, call, isNotFound } from '@/api/client'
import { tagQueries } from '@/features/tags/tagQueries'

export function useDeleteTagGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await call(
          api.DELETE('/api/tag_groups/{id}', { params: { path: { id } } }),
        )
      } catch (error) {
        // Deleted in another tab: already what was asked for.
        if (!isNotFound(error)) throw error
      }
    },
    // Its tags move to No group.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: tagQueries.all() }),
  })
}
