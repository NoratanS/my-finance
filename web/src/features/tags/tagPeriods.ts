import type { components } from '@/api/schema'

export type TagPeriod = components['schemas']['TagPeriod']

// The API's default, so neither the address nor the request names it.
export const thisMonth: TagPeriod = '1'

// The switch's spans, this month first; the API counts this month in each. The phrase follows an amount.
export const tagPeriods: {
  period: TagPeriod
  label: string
  phrase: string
}[] = [
  { period: thisMonth, label: 'This month', phrase: 'this month' },
  { period: '3', label: '3 months', phrase: 'in the last 3 months' },
  { period: '12', label: '12 months', phrase: 'in the last 12 months' },
]

const isTagPeriod = (value: string): value is TagPeriod =>
  tagPeriods.some(({ period }) => period === value)

// A span the switch doesn't offer is this month, so a hand-edited link still opens.
export function readTagPeriod(params: URLSearchParams): TagPeriod {
  const period = params.get('period') ?? ''
  return isTagPeriod(period) ? period : thisMonth
}

// The period as a query, this month left out: shared by the address and the API request; a record, as URLSearchParams takes.
export const tagPeriodQuery = (period: TagPeriod): Record<string, TagPeriod> =>
  period === thisMonth ? {} : { period }
