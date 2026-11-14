import { http, HttpResponse } from 'msw'
import type { components } from '@/api/schema'

export type Tag = components['schemas']['Tag']
type TagList = components['schemas']['TagList']

// A tag never used, with nothing in the period unless given.
export const tag = (
  id: number,
  name: string,
  extra: Partial<Tag> = {},
): Tag => ({
  id,
  name,
  colour: null,
  last_used_at: null,
  expense: 0,
  income: 0,
  transaction_count: 0,
  ...extra,
})

// The list's body: this month and nothing untagged unless given.
export const tagList = (
  data: Tag[],
  meta: Partial<TagList['meta']> = {},
): TagList => ({ data, meta: { period: '1', untagged_count: 0, ...meta } })

export const tagsListed = (...list: Parameters<typeof tagList>) =>
  http.get('/api/tags', () => HttpResponse.json(tagList(...list)))
