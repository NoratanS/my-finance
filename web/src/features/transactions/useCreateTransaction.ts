import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, call, type RequestBody } from '@/api/client'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { transactionQueries } from '@/features/transactions/transactionQueries'

export function useCreateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (transaction: RequestBody<'createTransaction'>) =>
      call(api.POST('/api/transactions', { body: transaction })),
    // The first transaction locks the currency, which the session reports.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: transactionQueries.all() }),
        queryClient.invalidateQueries({
          queryKey: sessionQueries.current().queryKey,
        }),
      ]),
  })
}
