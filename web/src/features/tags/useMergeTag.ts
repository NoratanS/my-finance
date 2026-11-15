import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, call, isNotFound } from '@/api/client'
import type { TagPeriod } from '@/features/tags/tagPeriods'
import { tagQueries } from '@/features/tags/tagQueries'
import { useForgetTag } from '@/features/tags/useForgetTag'

// Folds the tag into the target (GLOSSARY: Merge); the tag is then gone, so the page forgets it.
export function useMergeTag(id: number, period: TagPeriod) {
  const queryClient = useQueryClient()
  const forgetTag = useForgetTag(period)
  return useMutation({
    mutationFn: (targetId: number) =>
      call(
        api.POST('/api/tags/{tag_id}/merges', {
          params: { path: { tag_id: id } },
          body: { target_id: targetId },
        }),
      ),
    onSuccess: () => forgetTag(id),
    // Either tag deleted elsewhere: the page reloads without it.
    onError: (error) => {
      if (isNotFound(error))
        void queryClient.invalidateQueries({ queryKey: tagQueries.all() })
    },
  })
}
