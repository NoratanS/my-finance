import { http, HttpResponse } from 'msw'
import type { components } from '@/api/schema'

export type Tag = components['schemas']['Tag']
export type TagGroupSummary = components['schemas']['TagGroupSummary']
type TagList = components['schemas']['TagList']

// A tag never used, in no group, with nothing in the period unless given.
export const tag = (
  id: number,
  name: string,
  extra: Partial<Tag> = {},
): Tag => ({
  id,
  name,
  colour: null,
  group_id: null,
  last_used_at: null,
  expense: 0,
  income: 0,
  transaction_count: 0,
  ...extra,
})

// A group with nothing in the period unless given.
export const tagGroup = (
  id: number,
  name: string,
  extra: Partial<TagGroupSummary> = {},
): TagGroupSummary => ({
  id,
  name,
  expense: 0,
  income: 0,
  transaction_count: 0,
  ...extra,
})

// The list's body: this month, no groups and nothing untagged unless given.
export const tagList = (
  data: Tag[],
  meta: Partial<TagList['meta']> = {},
  groups: TagGroupSummary[] = [],
): TagList => ({
  data,
  groups,
  meta: { period: '1', untagged_count: 0, ...meta },
})

export const tagsListed = (...list: Parameters<typeof tagList>) =>
  http.get('/api/tags', () => HttpResponse.json(tagList(...list)))
