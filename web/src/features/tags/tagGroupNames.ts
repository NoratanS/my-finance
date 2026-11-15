import type { components } from '@/api/schema'

type TagList = components['schemas']['TagList']

// Each grouped tag's group name, by tag id: the grey suffix that tells like-named tags apart.
export const tagGroupNames = (list: TagList | undefined) => {
  const groups = new Map(list?.groups.map((group) => [group.id, group.name]))
  return new Map(
    list?.data.flatMap((tag) => {
      const group = tag.group_id === null ? undefined : groups.get(tag.group_id)
      return group === undefined ? [] : [[tag.id, group] as const]
    }),
  )
}
