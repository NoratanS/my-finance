import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Alert } from '@/components/ui/Alert'
import { PageTitle } from '@/components/ui/PageTitle'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { TransactionDialog } from '@/features/transactions/TransactionDialog'
import { TransactionList } from '@/features/transactions/TransactionList'
import { transactionQueries } from '@/features/transactions/transactionQueries'

const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
})

export function TransactionsPage() {
  const { data: session } = useSuspenseQuery(sessionQueries.current())
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const list = useQuery(transactionQueries.list(page))
  const emptyTitleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  // The key gives each opening a fresh form, dated today.
  const [closes, setCloses] = useState(0)
  const openDialog = () => dialogRef.current?.showModal()

  const showPage = (next: number) => {
    setSearchParams(next > 1 ? { page: String(next) } : {})
  }

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="text-[13px] font-semibold tracking-[0.01em] text-text-muted">
            {monthFormat.format(new Date())}
          </div>
          <PageTitle>Transactions</PageTitle>
        </div>
        <AddButton onClick={openDialog} />
      </header>
      {list.isPending ? (
        <ListLoading />
      ) : list.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Alert>Couldn’t load transactions.</Alert>
          <button
            type="button"
            onClick={() => void list.refetch()}
            className="min-h-11 press cursor-pointer rounded-full border border-divider bg-white/6 px-[18px] text-sm font-semibold text-text"
          >
            Try again
          </button>
        </div>
      ) : list.data.data.length > 0 ? (
        <TransactionList
          page={list.data}
          currency={session.currency}
          onPage={showPage}
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
          <AddButton onClick={openDialog} />
        </section>
      )}
      <TransactionDialog
        key={closes}
        ref={dialogRef}
        currency={session.currency}
        onClose={() => {
          setCloses((count) => count + 1)
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
