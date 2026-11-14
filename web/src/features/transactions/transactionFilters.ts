import type { components } from '@/api/schema'
import { formatCalendarMonth } from '@/lib/dates'

type Kind = components['schemas']['Kind']
export type Period = components['schemas']['Period']

// What the list shows, as the address holds it; no period means this month, as the API defaults.
// Tags and Untagged exclude each other, as the API does.
export type TransactionFilters = {
  period?: Period
  kind?: Kind
  tagIds: number[]
  untagged: boolean
  q: string
  page: number
}

// GLOSSARY: a transaction carries at most 5 tags, so filtering by more could only ever list nothing.
export const tagFilterLimit = 5

const periodPattern = /^(\d{4}-(0[1-9]|1[0-2])|all)$/
// Each kind as the filters name it: its Type button and its caption.
export const kindFilters: Record<Kind, { label: string; caption: string }> = {
  expense: { label: 'Expense', caption: 'expenses only' },
  income: { label: 'Income', caption: 'income only' },
}

const isKind = (value: string): value is Kind =>
  Object.hasOwn(kindFilters, value)

// A value the API would refuse with a 400 is dropped, so a hand-edited link still opens.
// A link with tags and Untagged keeps the tags.
export function readFilters(params: URLSearchParams): TransactionFilters {
  const period = params.get('period') ?? ''
  const kind = params.get('kind') ?? ''
  const tagIds = [
    ...new Set(
      params
        .getAll('tag')
        .filter((id) => /^[1-9]\d{0,14}$/.test(id))
        .map(Number),
    ),
  ].slice(0, tagFilterLimit)
  return {
    period: periodPattern.test(period) ? period : undefined,
    kind: isKind(kind) ? kind : undefined,
    tagIds,
    untagged: tagIds.length === 0 && params.get('untagged') === 'true',
    q: params.get('q') ?? '',
    page: Math.max(1, Number(params.get('page')) || 1),
  }
}

// Defaults are left out, so a fresh visit sends none and its address stays bare.
export function filterParams({
  period,
  kind,
  tagIds,
  untagged,
  q,
  page,
}: TransactionFilters) {
  return {
    ...(period && { period }),
    ...(kind && { kind }),
    ...(tagIds.length > 0 && { tag: tagIds }),
    ...(untagged && { untagged: 'true' as const }),
    ...(q.trim() && { q: q.trim() }),
    ...(page > 1 && { page }),
  }
}

// The API's names: tag_ids[] repeated is the array Rails reads; a bare repeated name keeps only the last.
export function listQuery(filters: TransactionFilters) {
  const { tag, ...rest } = filterParams(filters)
  return { ...rest, ...(tag && { 'tag_ids[]': tag }) }
}

// Each tag is its own tag= entry, so the address reads ?tag=3&tag=7.
export const filterSearch = (filters: TransactionFilters) =>
  new URLSearchParams(
    Object.entries(filterParams(filters)).flatMap(([name, value]) =>
      (Array.isArray(value) ? value : [value]).map((one) => [
        name,
        String(one),
      ]),
    ),
  )

// Anything Clear filters would change: a type, tags, Untagged, a search, or a period other than this month.
export const hasFilters = (
  { period, kind, tagIds, untagged, q }: TransactionFilters,
  thisMonth: string | undefined,
) =>
  Boolean(kind ?? q.trim()) ||
  tagIds.length > 0 ||
  untagged ||
  (period !== undefined && period !== thisMonth)

// Every filter off, on this month.
export const noFilters: TransactionFilters = {
  tagIds: [],
  untagged: false,
  q: '',
  page: 1,
}

export const formatPeriod = (period: Period) =>
  period === 'all' ? 'All time' : formatCalendarMonth(period)

// "October 2026 · all types · Biedronka + Groceries · “zabka”", the tags named as the caller knows them.
export function filtersCaption(
  period: Period,
  { kind, untagged, q }: TransactionFilters,
  tagNames: string[],
) {
  const tags = untagged
    ? ' · untagged only'
    : tagNames.length > 0
      ? ` · ${tagNames.join(' + ')}`
      : ''
  const search = q.trim() && ` · “${q.trim()}”`
  return `${formatPeriod(period)} · ${kind ? kindFilters[kind].caption : 'all types'}${tags}${search}`
}
