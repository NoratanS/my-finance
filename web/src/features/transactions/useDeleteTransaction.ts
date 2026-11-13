import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, call, isNotFound } from '@/api/client'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { transactionQueries } from '@/features/transactions/transactionQueries'

export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await call(
          api.DELETE('/api/transactions/{id}', { params: { path: { id } } }),
        )
      } catch (error) {
        // Deleted in another tab: already what was asked for.
        if (!isNotFound(error)) throw error
      }
    },
    // Deleting the last transaction unlocks the currency, which the session reports.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: transactionQueries.all() }),
        queryClient.invalidateQueries({
          queryKey: sessionQueries.current().queryKey,
        }),
      ]),
  })
}
