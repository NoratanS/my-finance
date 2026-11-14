import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, call } from '@/api/client'
import type { components } from '@/api/schema'
import { tagQueries } from '@/features/tags/tagQueries'

type TagInput = components['schemas']['TagInput']

export function useCreateTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tag: TagInput) => call(api.POST('/api/tags', { body: tag })),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: tagQueries.all() }),
  })
}
