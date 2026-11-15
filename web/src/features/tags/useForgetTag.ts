import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { tagsPageSearch } from '@/features/tags/tagsAddress'
import type { TagPeriod } from '@/features/tags/tagPeriods'
import { tagQueries } from '@/features/tags/tagQueries'
import { transactionQueries } from '@/features/transactions/transactionQueries'

// After a merge or delete: the gone tag's details go first and the address drops it, so nothing asks for it again;
// then the tags and the transactions carrying it reload.
export function useForgetTag(period: TagPeriod) {
  const queryClient = useQueryClient()
  const [, setSearchParams] = useSearchParams()
  return (id: number) => {
    queryClient.removeQueries({ queryKey: tagQueries.detailsOf(id) })
    setSearchParams(tagsPageSearch(period))
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: tagQueries.all() }),
      queryClient.invalidateQueries({ queryKey: transactionQueries.all() }),
    ])
  }
}
