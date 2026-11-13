import type { components } from '@/api/schema'
import { formatAmount } from '@/lib/money'

type Currency = components['schemas']['Currency']
type Transaction = components['schemas']['Transaction']

// A transaction's signed amount, as the boards show it: income in its colour.
export function Amount({
  transaction: { amount, kind },
  currency,
}: {
  transaction: Transaction
  currency: Currency
}) {
  return (
    <span
      className={`font-semibold whitespace-nowrap tabular-nums ${kind === 'income' ? 'text-income' : ''}`}
    >
      {formatAmount(amount, currency, kind)}
    </span>
  )
}
