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
const kinds: readonly string[] = ['expense', 'income'] satisfies Kind[]

// A value the API would refuse with a 400 is dropped, so a hand-edited link still opens.
export function readFilters(params: URLSearchParams): TransactionFilters {
  const period = params.get('period') ?? ''
  const kind = params.get('kind') ?? ''
  return {
    period: periodPattern.test(period) ? period : undefined,
    kind: kinds.includes(kind) ? (kind as Kind) : undefined,
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

const kindCaptions: Record<Kind, string> = {
  expense: 'expenses only',
  income: 'income only',
}

// "October 2026 · all types · “zabka”"
export function filtersCaption(
  period: Period,
  { kind, q }: TransactionFilters,
) {
  const search = q.trim() && ` · “${q.trim()}”`
  return `${formatPeriod(period)} · ${kind ? kindCaptions[kind] : 'all types'}${search}`
}
