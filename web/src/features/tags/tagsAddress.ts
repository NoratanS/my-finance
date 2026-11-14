import { type TagPeriod, tagPeriodQuery } from '@/features/tags/tagPeriods'

// The Tags page's address: its period, then the selected tag; this month and no tag are left out.
export const tagsPageSearch = (period: TagPeriod, tagId?: number) =>
  new URLSearchParams({
    ...tagPeriodQuery(period),
    ...(tagId !== undefined && { tag: String(tagId) }),
  }).toString()

// The selected tag's id; anything but a whole number is none.
export function readSelectedTag(params: URLSearchParams) {
  const id = params.get('tag') ?? ''
  return /^[1-9]\d{0,14}$/.test(id) ? Number(id) : undefined
}
