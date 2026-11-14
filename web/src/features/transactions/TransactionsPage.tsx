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
import { ghostButtonClass } from '@/components/ui/buttonStyles'
import { RetryAlert } from '@/components/ui/RetryAlert'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { DeleteTransactionDialog } from '@/features/transactions/DeleteTransactionDialog'
import { TotalsCard } from '@/features/transactions/TotalsCard'
import { TransactionDialog } from '@/features/transactions/TransactionDialog'
import { TransactionFilterBar } from '@/features/transactions/TransactionFilterBar'
import { TransactionList } from '@/features/transactions/TransactionList'
import {
  filterSearch,
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
  // No period in the address is this month, which only the API knows (its timezone, not the browser's).
  const period = filters.period ?? list.data?.meta.period
  const queryClient = useQueryClient()
  const emptyTitleId = useId()
  const noResultsTitleId = useId()
  // The search box keeps what was typed, so clearing the filters empties it by hand.
  const searchRef = useRef<HTMLInputElement>(null)
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

  // A search keystroke replaces the address entry, so Back skips the half-typed words.
  const showFilters = (next: TransactionFilters, replace = false) => {
    setSearchParams(filterSearch(next), { replace })
  }
  // Any filter change starts again from page 1.
  const changeFilters = (change: Partial<TransactionFilters>) => {
    showFilters({ ...filters, ...change, page: 1 }, 'q' in change)
  }
  const showPage = (page: number) => {
    showFilters({ ...filters, page })
  }
  const clearFilters = () => {
    if (searchRef.current) searchRef.current.value = ''
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
            searchRef={searchRef}
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
            <>
              <TotalsCard
                totals={list.data.meta.totals}
                currency={session.currency}
                caption={filtersCaption(list.data.meta.period, filters)}
              />
              {list.data.data.length > 0 ? (
                <TransactionList
                  page={list.data}
                  currency={session.currency}
                  onPage={showPage}
                  onEdit={openDialog}
                  onDelete={openDelete}
                />
              ) : (
                <section
                  aria-labelledby={noResultsTitleId}
                  className="flex min-h-[200px] flex-col items-center justify-center gap-2.5 rounded-3xl bg-surface p-7 text-center"
                >
                  <h2
                    id={noResultsTitleId}
                    className="m-0 text-[17px] leading-[1.25] font-[650]"
                  >
                    No transactions match these filters
                  </h2>
                  <p className="m-0 max-w-[340px] text-sm text-text-muted">
                    Try another month or All time.
                  </p>
                  <div className="mt-1 flex flex-wrap justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={clearFilters}
                      className={`${ghostButtonClass} press`}
                    >
                      Clear filters
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        changeFilters({ period: 'all' })
                      }}
                      className="inline-flex min-h-11 press cursor-pointer items-center justify-center rounded-full border-0 bg-accent-tint px-[18px] text-sm font-[650] text-accent"
                    >
                      Show All time
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </>
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

const addButtonClass =
  'inline-flex min-h-11 press cursor-pointer items-center justify-center rounded-full border-0 bg-accent px-[18px] text-sm font-[650] text-accent-ink'

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={addButtonClass}>
      Add transaction
    </button>
  )
}
