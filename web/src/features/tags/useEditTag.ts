import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, call } from '@/api/client'
import type { components } from '@/api/schema'
import { tagQueries } from '@/features/tags/tagQueries'
import { transactionQueries } from '@/features/transactions/transactionQueries'

type TagUpdate = components['schemas']['TagUpdate']

// Renames, recolours or regroups a tag; only the fields given change. The answer carries this month's totals, so the list reloads instead.
export function useEditTag(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: TagUpdate) =>
      call(
        api.PATCH('/api/tags/{id}', {
          params: { path: { id } },
          body: changes,
        }),
      ),
    // Either way: changed, or the tag or group was deleted elsewhere and the list should show it.
    // Transactions too, as their chips show the tag's name and colour.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: tagQueries.all() }),
        queryClient.invalidateQueries({ queryKey: transactionQueries.all() }),
      ]),
  })
}
