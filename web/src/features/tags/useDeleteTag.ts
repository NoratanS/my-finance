import { useMutation } from '@tanstack/react-query'
import { api, call, isNotFound } from '@/api/client'
import type { TagPeriod } from '@/features/tags/tagPeriods'
import { useForgetTag } from '@/features/tags/useForgetTag'

// Its transactions stay, without it; the page forgets it.
export function useDeleteTag(id: number, period: TagPeriod) {
  const forgetTag = useForgetTag(period)
  return useMutation({
    mutationFn: async () => {
      try {
        await call(api.DELETE('/api/tags/{id}', { params: { path: { id } } }))
      } catch (error) {
        // Deleted in another tab: already what was asked for.
        if (!isNotFound(error)) throw error
      }
    },
    onSuccess: () => forgetTag(id),
  })
}
