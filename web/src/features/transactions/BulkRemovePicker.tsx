import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { components } from '@/api/schema'
import { tagLimit } from '@/features/tags/tagLimit'
import { tagGroupNames } from '@/features/tags/tagGroupNames'
import { tagQueries } from '@/features/tags/tagQueries'
import {
  BulkPopover,
  BulkPopoverFooter,
  failedNote,
  TagOption,
} from '@/features/transactions/BulkPopover'
import { countOf } from '@/lib/countOf'
import { aToZ } from '@/lib/tagOrder'

type Transaction = components['schemas']['Transaction']
type Chip = Transaction['tags'][number]

// StatesRemoveTags' popover: pick up to 5 of the tags the selected rows carry, then remove them all at once.
export function BulkRemovePicker({
  rows,
  pending,
  error,
  onRemove,
  onClose,
}: {
  rows: Transaction[]
  pending: boolean
  error: unknown
  onRemove: (tagIds: number[]) => void
  onClose: () => void
}) {
  const tags = useQuery(tagQueries.list())
  const [chosen, setChosen] = useState<number[]>([])
  const title = `Remove tags from ${countOf(rows.length, 'transaction')}`
  // Chips carry no group, so it comes from the tags list.
  const groupNames = tagGroupNames(tags.data)
  const carried = new Map<number, Chip & { carriedBy: number }>()
  for (const chip of rows.flatMap((row) => row.tags)) {
    const seen = carried.get(chip.id)
    carried.set(chip.id, { ...chip, carriedBy: (seen?.carriedBy ?? 0) + 1 })
  }
  const options = aToZ([...carried.values()])
  // The API takes at most 5 tags a call.
  const full = chosen.length >= tagLimit
  const toggle = (tagId: number) => {
    setChosen(
      chosen.includes(tagId)
        ? chosen.filter((kept) => kept !== tagId)
        : [...chosen, tagId],
    )
  }

  return (
    <BulkPopover title={title} onClose={onClose}>
      <div className="px-3 pb-1.5 text-[13px] text-text-muted">
        Only tags these transactions carry.
      </div>
      <div
        role="listbox"
        aria-multiselectable="true"
        aria-label="Tags on the selected transactions"
        className="flex max-h-72 flex-col overflow-y-auto"
      >
        {options.map((tag, index) => {
          const selected = chosen.includes(tag.id)
          return (
            <TagOption
              key={tag.id}
              tag={tag}
              group={groupNames.get(tag.id)}
              selected={selected}
              disabled={full && !selected}
              // No search box to start in, so focus starts on the list, where Escape and the keys work.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={index === 0}
              onToggle={() => {
                toggle(tag.id)
              }}
            >
              <span className="text-[13px] text-text-muted">
                {' '}
                on {tag.carriedBy} of {rows.length}
              </span>
            </TagOption>
          )
        })}
      </div>
      <BulkPopoverFooter
        note={
          error
            ? failedNote(error, 'remove the tags')
            : full
              ? `Remove up to ${String(tagLimit)} tags at a time.`
              : 'Other tags stay.'
        }
        action={
          chosen.length > 0
            ? `Remove ${countOf(chosen.length, 'tag')}`
            : 'Remove'
        }
        ready={chosen.length > 0 && !pending}
        onAct={() => {
          onRemove(chosen)
        }}
      />
    </BulkPopover>
  )
}
