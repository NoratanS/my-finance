import type { components } from '@/api/schema'
import { Menu, menuItemProps } from '@/components/ui/Menu'
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
  'inline-flex size-11 flex-none press cursor-pointer items-center justify-center rounded-full border border-divider bg-white/6 text-text disabled:cursor-not-allowed disabled:bg-transparent disabled:text-text-muted/50 md:border-0'
const menuItemClass =
  'flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-3 text-left text-[16px] hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-offset-[-2px]'
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
  const rowLabel = (transaction: Transaction) =>
    transaction.description ||
    `${formatCalendarDay(transaction.date)} ${formatAmount(transaction.amount, currency, transaction.kind)}`
  const count = `${String(meta.total_count)} ${meta.total_count === 1 ? 'transaction' : 'transactions'}`

  return (
    <div className="flex flex-col gap-3 md:gap-0 md:overflow-hidden md:rounded-3xl md:bg-surface">
      <table className="w-full border-collapse max-md:hidden">
        <thead>
          <tr>
            <th scope="col" className={`${headClass} w-28 md:max-lg:w-16`}>
              Date
            </th>
            <th scope="col" className={headClass}>
              Description
            </th>
            <th scope="col" className={`${headClass} text-right`}>
              Amount
            </th>
            <th scope="col" className={`${headClass} w-28 md:max-lg:w-24`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((transaction) => (
            <tr key={transaction.id} className="hover:bg-white/4">
              <td className={`${cellClass} whitespace-nowrap text-text-muted`}>
                {formatCalendarDay(transaction.date)}
              </td>
              <td className={`${cellClass} wrap-anywhere`}>
                {transaction.description}
              </td>
              <td className={`${cellClass} text-right`}>
                <Amount transaction={transaction} currency={currency} />
              </td>
              <td className={`${cellClass} py-0 text-right whitespace-nowrap`}>
                <button
                  type="button"
                  aria-label={`Edit transaction ${rowLabel(transaction)}`}
                  onClick={() => {
                    onEdit(transaction)
                  }}
                  className={rowButtonClass}
                >
                  {icon(editPath)}
                </button>
                <button
                  type="button"
                  aria-label={`Delete transaction ${rowLabel(transaction)}`}
                  onClick={() => {
                    onDelete(transaction)
                  }}
                  className={rowButtonClass}
                >
                  {icon(deletePath)}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Phone: a row opens the transaction; its ⋯ menu edits or deletes it. */}
      <div className="rounded-[20px] bg-surface pr-1 pl-3 md:hidden">
        <ul aria-label="Transactions" className="m-0 list-none p-0">
          {data.map((transaction) => (
            <li
              key={transaction.id}
              className="relative flex min-h-18 items-center gap-1 border-t border-divider first:border-t-0"
            >
              <button
                type="button"
                onClick={() => {
                  onEdit(transaction)
                }}
                className="flex min-w-0 flex-auto cursor-pointer items-baseline gap-3 self-stretch rounded-xl border-0 bg-transparent py-2.5 pl-1 text-left text-[15px] text-text hover:bg-white/4"
              >
                <span className="min-w-0 flex-auto truncate font-medium">
                  {transaction.description && `${transaction.description} `}
                  <span className="font-normal text-text-muted">
                    {transaction.description && '· '}
                    {formatCalendarDay(transaction.date)}
                  </span>
                </span>
                <Amount transaction={transaction} currency={currency} />
              </button>
              <Menu
                label={`Actions for ${rowLabel(transaction)}`}
                triggerLabel={`Actions for ${rowLabel(transaction)}`}
                triggerClassName="inline-flex size-11 flex-none press cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-text-muted aria-expanded:bg-white/10"
                trigger={
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <circle cx="3" cy="8" r="1.4" />
                    <circle cx="8" cy="8" r="1.4" />
                    <circle cx="13" cy="8" r="1.4" />
                  </svg>
                }
                panelClassName="absolute top-[calc(100%+4px)] right-0 z-20 box-border w-[200px] rounded-2xl border border-white/14 bg-[rgba(44,44,50,0.94)] p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
              >
                {(close) => (
                  <>
                    <button
                      {...menuItemProps}
                      type="button"
                      onClick={() => {
                        close()
                        onEdit(transaction)
                      }}
                      className={`${menuItemClass} text-text`}
                    >
                      {icon(editPath)}
                      Edit
                    </button>
                    <button
                      {...menuItemProps}
                      type="button"
                      onClick={() => {
                        close()
                        onDelete(transaction)
                      }}
                      className={`${menuItemClass} text-danger`}
                    >
                      {icon(deletePath)}
                      Delete
                    </button>
                  </>
                )}
              </Menu>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-text-muted md:px-4 md:py-3">
        <span className="max-md:hidden">{count} · newest first</span>
        <span className="flex flex-auto items-center justify-between gap-2 md:flex-none">
          <span className="text-center">
            <span>
              Page {meta.page} of {meta.total_pages}
            </span>
            <span className="md:hidden"> · {count}</span>
          </span>
          <button
            type="button"
            aria-label="Previous page"
            disabled={meta.page <= 1}
            onClick={() => {
              onPage(meta.page - 1)
            }}
            className={`${pageButtonClass} max-md:order-first`}
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
    </div>
  )
}

const editPath = 'M10.5 2.5l3 3L6 13H3v-3z'
const deletePath = 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.75 8.5h5.5l.75-8.5'

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
