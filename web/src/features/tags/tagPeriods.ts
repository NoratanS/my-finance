import type { components } from '@/api/schema'

export type TagPeriod = components['schemas']['TagPeriod']

// The switch's spans, this month first; the API counts this month in each.
export const tagPeriods: { period: TagPeriod; label: string }[] = [
  { period: '1', label: 'This month' },
  { period: '3', label: '3 months' },
  { period: '12', label: '12 months' },
]

const isTagPeriod = (value: string): value is TagPeriod =>
  tagPeriods.some(({ period }) => period === value)

// A span the switch doesn't offer is this month, so a hand-edited link still opens.
export function readTagPeriod(params: URLSearchParams): TagPeriod {
  const period = params.get('period') ?? ''
  return isTagPeriod(period) ? period : '1'
}

// This month, the default, stays out of the address.
export const tagPeriodSearch = (period: TagPeriod) =>
  new URLSearchParams(period === '1' ? {} : { period })
