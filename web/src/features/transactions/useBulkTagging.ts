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
    mutationFn: bulkTaggingCall.additions,
    onSuccess: invalidate,
  })
}

// The two bulk calls, so an undo can take the one that reverses its action.
const bulkTaggingCall = {
  additions: (body: BulkTaggingInput) =>
    call(api.POST('/api/transaction_tag_additions', { body })),
  removals: (body: BulkTaggingInput) =>
    call(api.POST('/api/transaction_tag_removals', { body })),
}

// GLOSSARY: Bulk tagging. Only the picked tags go; a row that lost nothing is left out of the result.
export function useRemoveTags() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: bulkTaggingCall.removals,
    // Not awaited: the picker is built from the rows, so it must close before they reload without the tags.
    onSuccess: () => {
      void invalidate()
    },
  })
}

// Reverses exactly the links an action changed: one call per set of tags, so no row gains or
// loses a tag the action didn't touch. Rows or tags deleted meanwhile are ignored by the API.
export function useUndoBulkTagging(inverse: keyof typeof bulkTaggingCall) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (changed: BulkTagging['changed']) => {
      const results = await Promise.all(
        [...byTagSet(changed).values()].map(bulkTaggingCall[inverse]),
      )
      return {
        changed: results.flatMap((result) => result.changed),
        skipped_ids: results.flatMap((result) => result.skipped_ids),
      }
    },
    // On failure too: when one of the calls fails, the others may have done their part.
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
