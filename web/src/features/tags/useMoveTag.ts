import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, call } from '@/api/client'
import { tagQueries } from '@/features/tags/tagQueries'

// Puts a tag in a group, or none with null. The answer carries this month's totals, so the list reloads instead.
export function useMoveTag(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (groupId: number | null) =>
      call(
        api.PATCH('/api/tags/{id}', {
          params: { path: { id } },
          body: { group_id: groupId },
        }),
      ),
    // Either way: moved, or the tag or group was deleted elsewhere and the list should show it.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: tagQueries.all() }),
  })
}
