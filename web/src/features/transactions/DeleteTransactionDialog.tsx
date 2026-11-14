import { useId, useRef, type RefObject } from 'react'
import type { components } from '@/api/schema'
import { ghostButtonClass } from '@/components/ui/buttonStyles'
import { RetryAlert } from '@/components/ui/RetryAlert'
import { useBackdropClose } from '@/components/ui/useSheetDrag'
import { Amount } from '@/features/transactions/Amount'
import { useDeleteTransaction } from '@/features/transactions/useDeleteTransaction'
import { formatCalendarDay } from '@/lib/dates'
import { formatAmount } from '@/lib/money'

type Currency = components['schemas']['Currency']
type Transaction = components['schemas']['Transaction']

const phoneCard = 'max-md:border-white/12 max-md:bg-popover'
const genericTitle = 'Delete this transaction?'
const cancelClass = `${ghostButtonClass} max-md:min-h-14 max-md:rounded-[20px] max-md:border-0 max-md:bg-popover max-md:text-[17px] max-md:font-[650] max-md:text-accent`

// React's autoFocus fires on mount, before showModal(); the attribute lets the dialog start on whichever Cancel shows.
const autofocus = (button: HTMLButtonElement | null) => {
  button?.setAttribute('autofocus', '')
}

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
  const phoneLineRef = useRef<HTMLSpanElement>(null)
  const backdropProps = useBackdropClose(phoneLineRef)

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
      {...backdropProps}
      className="m-auto box-border w-[min(420px,calc(100%-2rem))] max-w-none sheet-motion rounded-[28px] border border-white/10 bg-[#1e1e22] p-7 text-text shadow-[0_24px_80px_rgba(0,0,0,0.6)] backdrop:bg-black/52 max-md:fixed max-md:inset-x-1 max-md:top-auto max-md:bottom-[calc(0.25rem+env(safe-area-inset-bottom))] max-md:m-0 max-md:w-auto max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-1 max-md:shadow-none max-md:backdrop:bg-black/50"
    >
      <div
        className="flex flex-col max-md:text-center md:grid md:grid-cols-[1fr_auto_auto] md:gap-x-3 md:gap-y-4"
        aria-busy={deleting}
      >
        <div
          className={`flex flex-col gap-4 max-md:gap-1 max-md:rounded-t-[20px] max-md:border max-md:border-b-0 max-md:px-5 max-md:pt-4 max-md:pb-3.5 md:col-span-3 ${phoneCard}`}
        >
          <h2
            id={titleId}
            className="m-0 text-[22px] leading-[1.2] font-bold tracking-[-0.016em] wrap-anywhere max-md:text-[15px] max-md:font-[650] max-md:tracking-normal"
          >
            {transaction?.description ? (
              <>
                <span className="max-md:hidden">{genericTitle}</span>
                <span className="md:hidden">
                  Delete “{transaction.description}”?
                </span>
              </>
            ) : (
              genericTitle
            )}
          </h2>
          <p
            id={descriptionId}
            className="m-0 text-text-muted max-md:text-[13px]"
          >
            <span className="max-md:hidden">
              It leaves your totals and tag amounts. This can’t be undone.
            </span>
            {transaction && (
              <span ref={phoneLineRef} className="md:hidden">
                {formatAmount(transaction.amount, currency, transaction.kind)} ·{' '}
                {formatCalendarDay(transaction.date)}. This can’t be undone.
              </span>
            )}
          </p>
        </div>
        {transaction && (
          <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-2 px-4 py-3 max-md:hidden md:col-span-3">
            <span className="min-w-0 wrap-anywhere">
              {[transaction.description, formatCalendarDay(transaction.date)]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <Amount transaction={transaction} currency={currency} />
          </div>
        )}
        {deleteTransaction.isError && (
          <div
            className={`max-md:border-x max-md:px-4 max-md:pb-3 max-md:text-left md:col-span-3 ${phoneCard}`}
          >
            <RetryAlert onRetry={confirm}>
              Couldn’t delete the transaction.
            </RetryAlert>
          </div>
        )}
        <button
          ref={autofocus}
          type="button"
          onClick={close}
          className={`${cancelClass} max-md:hidden md:col-start-2 md:mt-2`}
        >
          Cancel
        </button>
        <button
          type="button"
          aria-disabled={deleting}
          onClick={confirm}
          className={`min-h-11 press cursor-pointer rounded-full border-0 bg-danger px-[18px] text-sm font-[650] text-[#2e0c07] aria-disabled:cursor-progress max-md:min-h-14 max-md:rounded-t-none max-md:rounded-b-[20px] max-md:border max-md:border-t-divider max-md:text-[17px] max-md:font-semibold max-md:text-danger md:mt-2 ${phoneCard}`}
        >
          {deleting ? 'Deleting…' : 'Delete transaction'}
        </button>
        {/* On phone Cancel sits in its own card below Delete, so it follows it in the focus order too. */}
        <button
          ref={autofocus}
          type="button"
          onClick={close}
          className={`${cancelClass} mt-2 md:hidden`}
        >
          Cancel
        </button>
      </div>
    </dialog>
  )
}
