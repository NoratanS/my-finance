import type { components } from '@/api/schema'
import { formatAmount, formatNet } from '@/lib/money'

type Currency = components['schemas']['Currency']
type Totals = components['schemas']['TransactionPage']['meta']['totals']

const labelClass = 'text-[13px] font-semibold text-text-muted'
const valueClass =
  'font-semibold whitespace-nowrap tabular-nums md:text-[26px] md:leading-[1.14] md:font-[650] md:tracking-[-0.018em] lg:text-[28px]'
const sideClass = 'flex flex-col gap-0.5'
const dividedClass = 'md:border-l md:border-divider md:pl-5 lg:pl-6'

// The board's totals over the whole filtered list, with a caption naming the filters.
export function TotalsCard({
  totals,
  currency,
  caption,
}: {
  totals: Totals
  currency: Currency
  caption: string
}) {
  return (
    <section
      aria-label="Totals for these filters"
      className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-[20px] bg-surface px-5 py-4 md:grid-cols-3 md:gap-4 md:rounded-3xl md:px-6 md:py-5 lg:flex lg:flex-wrap lg:items-end lg:gap-x-8 lg:gap-y-4 lg:px-8"
    >
      <div className={`${sideClass} lg:flex-[1_1_180px]`}>
        <span className={labelClass}>Expenses</span>
        <span className={valueClass}>
          {formatAmount(totals.expense, currency)}
        </span>
      </div>
      <div className={`${sideClass} ${dividedClass} lg:flex-[1_1_180px]`}>
        <span className={labelClass}>Income</span>
        <span className={valueClass}>
          {formatAmount(totals.income, currency)}
        </span>
      </div>
      {/* A phone shows Net first and large, the other two beneath a line. */}
      <div
        className={`-order-1 col-span-2 flex items-baseline justify-between gap-3 max-md:border-b max-md:border-divider max-md:pb-2.5 md:order-none md:col-span-1 md:flex-col md:items-stretch md:justify-start md:gap-0.5 ${dividedClass} lg:flex-[1_1_180px]`}
      >
        <span className={labelClass}>Net</span>
        <span
          className={`${valueClass} text-[26px] leading-[1.1] font-bold tracking-[-0.015em]`}
        >
          {formatNet(totals.net, currency)}
        </span>
      </div>
      <p className="col-span-2 m-0 text-[13px] text-text-muted md:col-span-3 lg:flex-[2_1_260px] lg:text-right">
        {caption}
      </p>
    </section>
  )
}
