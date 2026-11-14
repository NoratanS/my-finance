import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useLocation, useSearchParams } from 'react-router'
import type { components } from '@/api/schema'
import { primaryButtonClass } from '@/components/ui/buttonStyles'
import { PageTitle } from '@/components/ui/PageTitle'
import { RetryAlert } from '@/components/ui/RetryAlert'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { DeleteTransactionDialog } from '@/features/transactions/DeleteTransactionDialog'
import { NoResultsCard } from '@/features/transactions/NoResultsCard'
import { TotalsCard } from '@/features/transactions/TotalsCard'
import { TransactionDialog } from '@/features/transactions/TransactionDialog'
import { TransactionFilterBar } from '@/features/transactions/TransactionFilterBar'
import { TransactionList } from '@/features/transactions/TransactionList'
import {
  filterSearch,
  hasFilters,
  filtersCaption,
  formatPeriod,
  readFilters,
  type TransactionFilters,
} from '@/features/transactions/transactionFilters'
import { transactionQueries } from '@/features/transactions/transactionQueries'

type Transaction = components['schemas']['Transaction']

export function TransactionsPage() {
  const { data: session } = useSuspenseQuery(sessionQueries.current())
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readFilters(searchParams)
  const list = useQuery(transactionQueries.list(filters))
  const months = useQuery(transactionQueries.months())
  // No period in the address is this month, which only the API knows (its timezone, not the browser's):
  // the list names it, or before that the months, which always start with it.
  const period =
    filters.period ??
    (list.data && !list.data.filters.period
      ? list.data.meta.period
      : months.data?.[0])
  const queryClient = useQueryClient()
  const emptyTitleId = useId()
  // The search box keeps what is typed; any other change to the address gives it a new key, so it re-reads q.
  const location = useLocation()
  const searchKey =
    (location.state as { searchKey?: string } | null)?.searchKey ?? location.key
  const dialogRef = useRef<HTMLDialogElement>(null)
  // A new key per opening: a fresh form, dated today even if the page stayed open past midnight.
  const [dialogKey, setDialogKey] = useState(0)
  const [editing, setEditing] = useState<Transaction>()
  const tagsRef = useRef<HTMLInputElement>(null)
  const openDialog = (transaction?: Transaction) => {
    flushSync(() => {
      setDialogKey((count) => count + 1)
      setEditing(transaction)
    })
    dialogRef.current?.showModal()
  }
  // After showModal, which focuses the dialog's first field itself.
  const openOnTags = (transaction: Transaction) => {
    openDialog(transaction)
    tagsRef.current?.focus()
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

  const showFilters = (next: TransactionFilters) => {
    setSearchParams(filterSearch(next))
  }
  // Any filter change starts again from page 1.
  const changeFilters = (change: Partial<TransactionFilters>) => {
    showFilters({ ...filters, ...change, page: 1 })
  }
  // A keystroke replaces the address entry, so Back skips half-typed words, and keeps the box's key.
  const changeSearch = (q: string) => {
    setSearchParams(filterSearch({ ...filters, q, page: 1 }), {
      replace: true,
      state: { searchKey },
    })
  }
  const showPage = (page: number) => {
    showFilters({ ...filters, page })
  }
  const clearFilters = () => {
    showFilters({ q: '', page: 1 })
  }
  // After a save or delete has refetched the list: the API shows the nearest page when this one emptied.
  const keepPageValid = () => {
    const shown = queryClient.getQueryData(
      transactionQueries.list(filters).queryKey,
    )
    if (shown && shown.meta.page !== filters.page) showPage(shown.meta.page)
  }

  return (
    <>
      <header className="flex items-end justify-between gap-4 md:flex-wrap">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-[13px] font-semibold tracking-[0.01em] text-text-muted">
            {period && formatPeriod(period)}
          </div>
          <PageTitle>Transactions</PageTitle>
        </div>
        <button
          type="button"
          onClick={() => {
            openDialog()
          }}
          className={`${addButtonClass} flex-none max-md:size-11 max-md:p-0`}
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="md:hidden"
          >
            <path d="M8 2.5v11M2.5 8h11" />
          </svg>
          <span className="max-md:sr-only">Add transaction</span>
        </button>
      </header>
      {!session.currency_locked ? (
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
      ) : (
        <>
          <TransactionFilterBar
            filters={filters}
            period={period}
            months={months.data ?? []}
            searchKey={searchKey}
            onSearch={changeSearch}
            onChange={changeFilters}
          />
          {list.isPending ? (
            <ListLoading />
          ) : list.isError ? (
            <div className="flex flex-col gap-2.5 rounded-3xl bg-surface p-6">
              <RetryAlert onRetry={() => void list.refetch()}>
                Couldn’t load transactions.
              </RetryAlert>
              <p className="m-0 text-[13px] text-text-muted">
                Totals are hidden until the list loads, so they never disagree
                with it.
              </p>
            </div>
          ) : (
            // The last results stay up while the next load, marked busy so they don't pass for the new filters.
            <div
              aria-busy={list.isPlaceholderData}
              className="flex flex-col gap-6 transition-opacity aria-busy:opacity-60"
            >
              <TotalsCard
                totals={list.data.meta.totals}
                currency={session.currency}
                caption={filtersCaption(
                  list.data.meta.period,
                  list.data.filters,
                )}
              />
              {list.data.data.length > 0 ? (
                <TransactionList
                  page={list.data}
                  currency={session.currency}
                  onPage={showPage}
                  onEdit={openDialog}
                  onAddTags={openOnTags}
                  onDelete={openDelete}
                />
              ) : (
                <NoResultsCard
                  allTime={list.data.meta.period === 'all'}
                  onClear={
                    hasFilters(list.data.filters, months.data?.[0])
                      ? clearFilters
                      : undefined
                  }
                  onShowAllTime={() => {
                    changeFilters({ period: 'all' })
                  }}
                />
              )}
            </div>
          )}
        </>
      )}
      <TransactionDialog
        key={dialogKey}
        ref={dialogRef}
        currency={session.currency}
        transaction={editing}
        tagsRef={tagsRef}
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

const addButtonClass = `${primaryButtonClass} inline-flex min-h-11 items-center justify-center px-[18px] text-sm`

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={addButtonClass}>
      Add transaction
    </button>
  )
}
