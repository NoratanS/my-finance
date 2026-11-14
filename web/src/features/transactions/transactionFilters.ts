import type { components } from '@/api/schema'
import { formatCalendarMonth } from '@/lib/dates'

type Kind = components['schemas']['Kind']
export type Period = components['schemas']['Period']

// Tag ids that must all match (never empty), or untagged ones only: one value, so it can't be both, as the API refuses.
export type TagFilter = number[] | 'untagged'

// What the list shows, as the address holds it; no period means this month, as the API defaults.
export type TransactionFilters = {
  period?: Period
  kind?: Kind
  tags?: TagFilter
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

// A value the API would refuse with a 400 is dropped, so a hand-edited link still opens; tags win over Untagged.
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
    tags:
      tagIds.length > 0
        ? tagIds
        : params.get('untagged') === 'true'
          ? 'untagged'
          : undefined,
    q: params.get('q') ?? '',
    page: Math.max(1, Number(params.get('page')) || 1),
  }
}

// Defaults are left out, so a fresh visit sends none and its address stays bare.
export function filterParams({
  period,
  kind,
  tags,
  q,
  page,
}: TransactionFilters) {
  return {
    ...(period && { period }),
    ...(kind && { kind }),
    ...(Array.isArray(tags) && { tag: tags }),
    ...(tags === 'untagged' && { untagged: 'true' as const }),
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
  { period, kind, tags, q }: TransactionFilters,
  thisMonth: string | undefined,
) =>
  Boolean(kind ?? tags ?? q.trim()) ||
  (period !== undefined && period !== thisMonth)

export const formatPeriod = (period: Period) =>
  period === 'all' ? 'All time' : formatCalendarMonth(period)

// "October 2026 · all types · Biedronka + Groceries · “zabka”", the tags named as the caller knows them.
export function filtersCaption(
  period: Period,
  { kind, tags, q }: TransactionFilters,
  tagNames: string[],
) {
  return [
    formatPeriod(period),
    kind ? kindFilters[kind].caption : 'all types',
    tags === 'untagged' ? 'untagged only' : tagNames.join(' + '),
    q.trim() && `“${q.trim()}”`,
  ]
    .filter(Boolean)
    .join(' · ')
}
