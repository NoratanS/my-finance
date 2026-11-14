import type { components } from '@/api/schema'
import { TagDot } from '@/features/tags/TagDot'
import { formatAmount } from '@/lib/money'

type Currency = components['schemas']['Currency']
type Tag = components['schemas']['Tag']

const totalClass =
  'text-xl leading-[1.2] font-[650] tracking-[-0.012em] tabular-nums'

const transactionCount = (count: number) =>
  `${String(count)} ${count === 1 ? 'transaction' : 'transactions'}`

// The board's tag card: what it cost, a green + for what it earned, and how many transactions over the period.
export function TagCard({ tag, currency }: { tag: Tag; currency: Currency }) {
  const incomeOnly = tag.expense === 0 && tag.income > 0
  return (
    <li className="flex flex-col gap-0.5 rounded-[20px] bg-surface px-5 py-4 wrap-anywhere">
      <span className="inline-flex items-center gap-2.5 font-semibold">
        <TagDot colour={tag.colour} />
        {tag.name}
      </span>
      {incomeOnly ? (
        <span className={`${totalClass} text-income`}>
          {formatAmount(tag.income, currency, 'income')}
        </span>
      ) : (
        <>
          <span className={totalClass}>
            {formatAmount(tag.expense, currency)}
          </span>
          {tag.income > 0 && (
            <span className="text-sm font-semibold text-income tabular-nums">
              {formatAmount(tag.income, currency, 'income')}
            </span>
          )}
        </>
      )}
      <span className="text-[13px] text-text-muted">
        {transactionCount(tag.transaction_count)}
      </span>
    </li>
  )
}
