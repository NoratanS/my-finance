import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, call, isNotFound, type RequestBody } from '@/api/client'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { transactionQueries } from '@/features/transactions/transactionQueries'

type TransactionInput = RequestBody<'createTransaction'>

// Adds a transaction, or with an id replaces that one's fields.
export function useSaveTransaction(id?: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (transaction: TransactionInput) =>
      call(
        id === undefined
          ? api.POST('/api/transactions', { body: transaction })
          : api.PATCH('/api/transactions/{id}', {
              params: { path: { id } },
              body: transaction,
            }),
      ),
    // The first transaction locks the currency, which the session reports.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: transactionQueries.all() }),
        queryClient.invalidateQueries({
          queryKey: sessionQueries.current().queryKey,
        }),
      ]),
    // Deleted elsewhere while being edited: the list drops it.
    onError: (error) => {
      if (isNotFound(error))
        void queryClient.invalidateQueries({
          queryKey: transactionQueries.all(),
        })
    },
  })
}
