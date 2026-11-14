import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, call, isNotFound } from '@/api/client'
import type { components } from '@/api/schema'
import { tagQueries } from '@/features/tags/tagQueries'

type TagInput = components['schemas']['TagInput']

export function useCreateTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tag: TagInput) => call(api.POST('/api/tags', { body: tag })),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: tagQueries.all() }),
    // The group picked was deleted elsewhere: the list reloads without it.
    onError: (error) => {
      if (isNotFound(error))
        void queryClient.invalidateQueries({ queryKey: tagQueries.all() })
    },
  })
}
