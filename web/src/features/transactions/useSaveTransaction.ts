import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, call, isNotFound, isTagNotFound } from '@/api/client'
import type { components } from '@/api/schema'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { tagQueries } from '@/features/tags/tagQueries'
import { transactionQueries } from '@/features/transactions/transactionQueries'

type TransactionInput = components['schemas']['TransactionInput']

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
    // The first transaction locks the currency, which the session reports; tags put on move their last use.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: transactionQueries.all() }),
        queryClient.invalidateQueries({
          queryKey: sessionQueries.current().queryKey,
        }),
        queryClient.invalidateQueries({ queryKey: tagQueries.all() }),
      ]),
    // The transaction deleted elsewhere: the list drops it. A deleted tag is the dialog's, which owns the field.
    onError: (error) => {
      if (isNotFound(error) && !isTagNotFound(error))
        void queryClient.invalidateQueries({
          queryKey: transactionQueries.all(),
        })
    },
  })
}
