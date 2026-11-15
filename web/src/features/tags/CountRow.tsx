import { countOf } from '@/lib/countOf'

// The confirmations' one-line tally: how many transactions, then what happens to them.
export function CountRow({ count, says }: { count: number; says: string }) {
  return (
    <div className="flex justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-2.5">
      <span>{countOf(count, 'transaction')}</span>
      <span className="text-text-muted">{says}</span>
    </div>
  )
}
