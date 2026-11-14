import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, call, isNotFound } from '@/api/client'
import type { components } from '@/api/schema'
import { tagQueries } from '@/features/tags/tagQueries'

type TagGroupInput = components['schemas']['TagGroupInput']

// Creates a tag group, or with an id renames that one.
export function useSaveTagGroup(id?: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (group: TagGroupInput) =>
      call(
        id === undefined
          ? api.POST('/api/tag_groups', { body: group })
          : api.PATCH('/api/tag_groups/{id}', {
              params: { path: { id } },
              body: group,
            }),
      ),
    // Returned, so a caller's onSuccess runs once the list holds the group.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: tagQueries.all() }),
    // Deleted elsewhere: the page reloads without it.
    onError: (error) => {
      if (isNotFound(error))
        void queryClient.invalidateQueries({ queryKey: tagQueries.all() })
    },
  })
}
