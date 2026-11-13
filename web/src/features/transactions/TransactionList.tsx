import type { components } from '@/api/schema'
import { Amount } from '@/features/transactions/Amount'
import { formatCalendarDay } from '@/lib/dates'
import { formatAmount } from '@/lib/money'

type Currency = components['schemas']['Currency']
type Transaction = components['schemas']['Transaction']
type TransactionPage = components['schemas']['TransactionPage']

const headClass =
  'border-b border-divider px-4 py-3 text-left text-[13px] font-semibold text-text-muted'
const cellClass = 'border-b border-divider px-4 py-3'
const pageButtonClass =
  'inline-flex size-11 press cursor-pointer items-center justify-center rounded-full border-0 bg-white/6 text-text disabled:cursor-not-allowed disabled:text-text-muted/50'
const rowButtonClass =
  'inline-flex size-11 press cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-text-muted hover:text-text'

export function TransactionList({
  page: { data, meta },
  currency,
  onPage,
  onEdit,
  onDelete,
}: {
  page: TransactionPage
  currency: Currency
  onPage: (page: number) => void
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
}) {
  return (
    <section className="overflow-hidden rounded-3xl bg-surface">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={`${headClass} w-28`}>
              Date
            </th>
            <th scope="col" className={headClass}>
              Description
            </th>
            <th scope="col" className={`${headClass} text-right`}>
              Amount
            </th>
            <th scope="col" className={`${headClass} w-28`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((transaction) => {
            const rowLabel =
              transaction.description ||
              `${formatCalendarDay(transaction.date)} ${formatAmount(transaction.amount, currency, transaction.kind)}`
            return (
              <tr key={transaction.id} className="hover:bg-white/4">
                <td
                  className={`${cellClass} whitespace-nowrap text-text-muted`}
                >
                  {formatCalendarDay(transaction.date)}
                </td>
                <td className={`${cellClass} wrap-anywhere`}>
                  {transaction.description}
                </td>
                <td className={`${cellClass} text-right`}>
                  <Amount transaction={transaction} currency={currency} />
                </td>
                <td
                  className={`${cellClass} py-0 text-right whitespace-nowrap`}
                >
                  <button
                    type="button"
                    aria-label={`Edit transaction ${rowLabel}`}
                    onClick={() => {
                      onEdit(transaction)
                    }}
                    className={rowButtonClass}
                  >
                    {icon('M10.5 2.5l3 3L6 13H3v-3z')}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete transaction ${rowLabel}`}
                    onClick={() => {
                      onDelete(transaction)
                    }}
                    className={rowButtonClass}
                  >
                    {icon(
                      'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.75 8.5h5.5l.75-8.5',
                    )}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px] text-text-muted">
        <span>
          {meta.total_count}{' '}
          {meta.total_count === 1 ? 'transaction' : 'transactions'} · newest
          first
        </span>
        <span className="flex items-center gap-2">
          <span>
            Page {meta.page} of {meta.total_pages}
          </span>
          <button
            type="button"
            aria-label="Previous page"
            disabled={meta.page <= 1}
            onClick={() => {
              onPage(meta.page - 1)
            }}
            className={pageButtonClass}
          >
            {chevron('M7.5 2.5 4 6l3.5 3.5')}
          </button>
          <button
            type="button"
            aria-label="Next page"
            disabled={meta.page >= meta.total_pages}
            onClick={() => {
              onPage(meta.page + 1)
            }}
            className={pageButtonClass}
          >
            {chevron('M4.5 2.5 8 6l-3.5 3.5')}
          </button>
        </span>
      </div>
    </section>
  )
}

const chevron = (path: string) => (
  <svg
    aria-hidden="true"
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={path} />
  </svg>
)

const icon = (path: string) => (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={path} />
  </svg>
)
