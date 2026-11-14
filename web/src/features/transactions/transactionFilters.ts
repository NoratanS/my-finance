import type { components } from '@/api/schema'
import { formatCalendarMonth } from '@/lib/dates'

type Kind = components['schemas']['Kind']
export type Period = components['schemas']['Period']

// What the list shows, as the address holds it; no period means this month, as the API defaults.
export type TransactionFilters = {
  period?: Period
  kind?: Kind
  q: string
  page: number
}

const periodPattern = /^(\d{4}-(0[1-9]|1[0-2])|all)$/
// Each kind as the filters name it: its Type button and its caption.
export const kindFilters: Record<Kind, { label: string; caption: string }> = {
  expense: { label: 'Expense', caption: 'expenses only' },
  income: { label: 'Income', caption: 'income only' },
}

const isKind = (value: string): value is Kind =>
  Object.hasOwn(kindFilters, value)

// A value the API would refuse with a 400 is dropped, so a hand-edited link still opens.
export function readFilters(params: URLSearchParams): TransactionFilters {
  const period = params.get('period') ?? ''
  const kind = params.get('kind') ?? ''
  return {
    period: periodPattern.test(period) ? period : undefined,
    kind: isKind(kind) ? kind : undefined,
    q: params.get('q') ?? '',
    page: Math.max(1, Number(params.get('page')) || 1),
  }
}

// Defaults are left out, so a fresh visit sends none and its address stays bare.
export function filterParams({ period, kind, q, page }: TransactionFilters) {
  return {
    ...(period && { period }),
    ...(kind && { kind }),
    ...(q.trim() && { q: q.trim() }),
    ...(page > 1 && { page }),
  }
}

export const filterSearch = (filters: TransactionFilters) =>
  new URLSearchParams(
    Object.entries(filterParams(filters)).map(([name, value]) => [
      name,
      String(value),
    ]),
  )

// Anything Clear filters would change: a type, a search, or a period other than this month.
export const hasFilters = (
  { period, kind, q }: TransactionFilters,
  thisMonth: string | undefined,
) => Boolean(kind ?? q.trim()) || (period !== undefined && period !== thisMonth)

export const formatPeriod = (period: Period) =>
  period === 'all' ? 'All time' : formatCalendarMonth(period)

// "October 2026 · all types · “zabka”"
export function filtersCaption(
  period: Period,
  { kind, q }: TransactionFilters,
) {
  const search = q.trim() && ` · “${q.trim()}”`
  return `${formatPeriod(period)} · ${kind ? kindFilters[kind].caption : 'all types'}${search}`
}
