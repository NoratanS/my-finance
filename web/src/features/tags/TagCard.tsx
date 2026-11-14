import { Link } from 'react-router'
import type { components } from '@/api/schema'
import { TagDot } from '@/features/tags/TagDot'
import { tagsPageSearch } from '@/features/tags/tagsAddress'
import type { TagPeriod } from '@/features/tags/tagPeriods'
import { formatAmount } from '@/lib/money'
import { countOf } from '@/lib/countOf'

type Currency = components['schemas']['Currency']
type Tag = components['schemas']['Tag']

// One line, shrinking with a narrow card (two to a phone row) so 999 999,99 PLN still fits.
const totalClass =
  'text-[length:min(1.25rem,11cqi)] leading-[1.2] font-[650] tracking-[-0.012em] whitespace-nowrap tabular-nums'

// The board's tag card: what it cost, a green + for what it earned, and how many transactions over the period.
// A link that selects the tag, or closes its details when it is the selected one.
export function TagCard({
  tag,
  currency,
  period,
  selected,
}: {
  tag: Tag
  currency: Currency
  period: TagPeriod
  selected: boolean
}) {
  const incomeOnly = tag.expense === 0 && tag.income > 0
  return (
    <li className="flex">
      <Link
        to={{ search: tagsPageSearch(period, selected ? undefined : tag.id) }}
        aria-current={selected || undefined}
        className="@container flex flex-auto flex-col gap-0.5 rounded-[20px] bg-surface px-5 py-4 text-text no-underline hover:bg-[#222226] aria-[current=true]:shadow-[inset_0_0_0_2px_var(--color-accent)]"
      >
        <span className="inline-flex items-center gap-2.5 font-semibold wrap-anywhere">
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
              <span className="text-sm font-semibold whitespace-nowrap text-income tabular-nums">
                {formatAmount(tag.income, currency, 'income')}
              </span>
            )}
          </>
        )}
        <span className="text-[13px] text-text-muted">
          {countOf(tag.transaction_count, 'transaction')}
        </span>
      </Link>
    </li>
  )
}
