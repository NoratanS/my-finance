import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, call } from '@/api/client'
import type { components } from '@/api/schema'
import { tagQueries } from '@/features/tags/tagQueries'
import { transactionQueries } from '@/features/transactions/transactionQueries'

type BulkTaggingInput = components['schemas']['BulkTaggingInput']
export type BulkTagging = components['schemas']['BulkTagging']

// Rows and tags both move: the list shows new chips, the tags new counts and last use.
const useInvalidate = () => {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: transactionQueries.all() }),
      queryClient.invalidateQueries({ queryKey: tagQueries.all() }),
    ])
}

// GLOSSARY: Bulk tagging. Existing tags stay; a row the tags would take past 5 is skipped.
export function useAddTags() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: BulkTaggingInput) =>
      call(api.POST('/api/transaction_tag_additions', { body })),
    onSuccess: invalidate,
  })
}

// Removes exactly the links an addition made: one call per set of tags added, so a tag a row
// already had stays. Rows or tags deleted meanwhile are ignored by the API.
export function useUndoAddTags() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (changed: BulkTagging['changed']) =>
      Promise.all(
        [...byTagSet(changed).values()].map((body) =>
          call(api.POST('/api/transaction_tag_removals', { body })),
        ),
      ),
    // On failure too: when one of the calls fails, the others may have removed their tags.
    onSettled: invalidate,
  })
}

const byTagSet = (changed: BulkTagging['changed']) => {
  const groups = new Map<string, BulkTaggingInput>()
  for (const { id, tag_ids } of changed) {
    const key = tag_ids.toSorted((a, b) => a - b).join(',')
    const group = groups.get(key)
    if (group) group.transaction_ids.push(id)
    else groups.set(key, { transaction_ids: [id], tag_ids })
  }
  return groups
}
