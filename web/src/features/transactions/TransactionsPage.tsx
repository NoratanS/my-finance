import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useSearchParams } from 'react-router'
import type { components } from '@/api/schema'
import { PageTitle } from '@/components/ui/PageTitle'
import { RetryAlert } from '@/components/ui/RetryAlert'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { DeleteTransactionDialog } from '@/features/transactions/DeleteTransactionDialog'
import { TransactionDialog } from '@/features/transactions/TransactionDialog'
import { TransactionList } from '@/features/transactions/TransactionList'
import { transactionQueries } from '@/features/transactions/transactionQueries'
import { formatMonthYear } from '@/lib/dates'

type Transaction = components['schemas']['Transaction']

export function TransactionsPage() {
  const { data: session } = useSuspenseQuery(sessionQueries.current())
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const list = useQuery(transactionQueries.list(page))
  const queryClient = useQueryClient()
  const emptyTitleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  // A new key per opening: a fresh form, dated today even if the page stayed open past midnight.
  const [dialogKey, setDialogKey] = useState(0)
  const [editing, setEditing] = useState<Transaction>()
  const openDialog = (transaction?: Transaction) => {
    flushSync(() => {
      setDialogKey((count) => count + 1)
      setEditing(transaction)
    })
    dialogRef.current?.showModal()
  }
  const deleteRef = useRef<HTMLDialogElement>(null)
  // A new key per opening too, so a failed delete doesn't greet the next one.
  const [deleteKey, setDeleteKey] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<Transaction>()
  const openDelete = (transaction: Transaction) => {
    flushSync(() => {
      setDeleteKey((count) => count + 1)
      setPendingDelete(transaction)
    })
    deleteRef.current?.showModal()
  }

  const showPage = (next: number) => {
    setSearchParams(next > 1 ? { page: String(next) } : {})
  }
  // After a save or delete has refetched the list: the API shows the nearest page when this one emptied.
  const keepPageValid = () => {
    const shown = queryClient.getQueryData(
      transactionQueries.list(page).queryKey,
    )
    if (shown && shown.meta.page !== page) showPage(shown.meta.page)
  }

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="text-[13px] font-semibold tracking-[0.01em] text-text-muted">
            {formatMonthYear(new Date())}
          </div>
          <PageTitle>Transactions</PageTitle>
        </div>
        <AddButton
          onClick={() => {
            openDialog()
          }}
        />
      </header>
      {list.isPending ? (
        <ListLoading />
      ) : list.isError ? (
        <RetryAlert onRetry={() => void list.refetch()}>
          Couldn’t load transactions.
        </RetryAlert>
      ) : list.data.data.length > 0 ? (
        <TransactionList
          page={list.data}
          currency={session.currency}
          onPage={showPage}
          onEdit={openDialog}
          onDelete={openDelete}
        />
      ) : session.currency_locked ? (
        <p className="m-0 text-text-muted">Nothing recorded this month yet.</p>
      ) : (
        <section
          aria-labelledby={emptyTitleId}
          className="flex flex-col items-center gap-3 rounded-3xl bg-surface px-8 py-12 text-center"
        >
          <h2
            id={emptyTitleId}
            className="m-0 text-[22px] leading-[1.2] font-bold tracking-[-0.016em]"
          >
            Record your first transaction
          </h2>
          <p className="m-0 max-w-[420px] text-text-muted">
            Add what you spent or earned, and it shows up here.
          </p>
          <AddButton
            onClick={() => {
              openDialog()
            }}
          />
        </section>
      )}
      <TransactionDialog
        key={dialogKey}
        ref={dialogRef}
        currency={session.currency}
        transaction={editing}
        onSaved={keepPageValid}
        onDelete={openDelete}
      />
      <DeleteTransactionDialog
        key={`delete-${String(deleteKey)}`}
        ref={deleteRef}
        currency={session.currency}
        transaction={pendingDelete}
        onDeleted={() => {
          dialogRef.current?.close()
          keepPageValid()
        }}
      />
    </>
  )
}

// The board's skeleton keeps the layout; no spinner.
function ListLoading() {
  return (
    <section
      aria-busy="true"
      className="flex flex-col gap-3 rounded-3xl bg-surface p-4"
    >
      <span className="sr-only">Loading transactions</span>
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} aria-hidden="true" className="flex items-center gap-4">
          <span className="h-4 w-14 rounded-[7px] bg-white/7" />
          <span className="h-4 flex-auto rounded-[7px] bg-white/7" />
          <span className="h-4 w-24 rounded-[7px] bg-white/7" />
        </div>
      ))}
    </section>
  )
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 press cursor-pointer rounded-full border-0 bg-accent px-[18px] text-sm font-[650] text-accent-ink"
    >
      Add transaction
    </button>
  )
}
