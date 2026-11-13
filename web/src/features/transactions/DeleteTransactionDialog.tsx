import { useId, type RefObject } from 'react'
import type { components } from '@/api/schema'
import { ghostButtonClass } from '@/components/ui/buttonStyles'
import { RetryAlert } from '@/components/ui/RetryAlert'
import { Amount } from '@/features/transactions/Amount'
import { useDeleteTransaction } from '@/features/transactions/useDeleteTransaction'
import { formatCalendarDay } from '@/lib/dates'

type Currency = components['schemas']['Currency']
type Transaction = components['schemas']['Transaction']

// A native modal <dialog> like TransactionDialog; Cancel comes first, so showModal() focuses it.
export function DeleteTransactionDialog({
  ref,
  currency,
  transaction,
  onDeleted,
}: {
  ref: RefObject<HTMLDialogElement | null>
  currency: Currency
  transaction: Transaction | undefined
  onDeleted: () => void
}) {
  const deleteTransaction = useDeleteTransaction()
  const titleId = useId()
  const descriptionId = useId()

  const close = () => {
    ref.current?.close()
  }
  const deleting = deleteTransaction.isPending
  const confirm = () => {
    if (!transaction || deleting) return
    deleteTransaction.mutate(transaction.id, {
      onSuccess: () => {
        close()
        onDeleted()
      },
    })
  }

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="m-auto box-border w-[min(420px,calc(100%-2rem))] max-w-none rounded-[28px] border border-white/10 bg-[#1e1e22] p-7 text-text shadow-[0_24px_80px_rgba(0,0,0,0.6)] backdrop:bg-black/52"
    >
      <div className="flex flex-col gap-4" aria-busy={deleting}>
        <h2
          id={titleId}
          className="m-0 text-[22px] leading-[1.2] font-bold tracking-[-0.016em]"
        >
          Delete this transaction?
        </h2>
        <p id={descriptionId} className="m-0 text-text-muted">
          It leaves your totals and tag amounts. This can’t be undone.
        </p>
        {transaction && (
          <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-2 px-4 py-3">
            <span className="min-w-0 wrap-anywhere">
              {[transaction.description, formatCalendarDay(transaction.date)]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <Amount transaction={transaction} currency={currency} />
          </div>
        )}
        {deleteTransaction.isError && (
          <RetryAlert onRetry={confirm}>
            Couldn’t delete the transaction.
          </RetryAlert>
        )}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <button type="button" onClick={close} className={ghostButtonClass}>
            Cancel
          </button>
          <button
            type="button"
            aria-disabled={deleting}
            onClick={confirm}
            className="min-h-11 press cursor-pointer rounded-full border-0 bg-danger px-[18px] text-sm font-[650] text-[#2e0c07] aria-disabled:cursor-progress"
          >
            {deleting ? 'Deleting…' : 'Delete transaction'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
