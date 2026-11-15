import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { tagLimit, tagLimitReached } from '@/features/tags/tagLimit'
import { tagQueries } from '@/features/tags/tagQueries'
import {
  BulkPopover,
  BulkPopoverFooter,
  failedNote,
  TagOption,
} from '@/features/transactions/BulkPopover'
import { countOf } from '@/lib/countOf'
import { matchesSearch } from '@/lib/search'
import { aToZ, byRecentUse } from '@/lib/tagOrder'

// StatesBulk's Add tags popover: pick up to 5 tags, then add them all at once.
export function BulkTagPicker({
  rowCount,
  pending,
  error,
  onAdd,
  onClose,
}: {
  rowCount: number
  pending: boolean
  error: unknown
  onAdd: (tagIds: number[]) => void
  onClose: () => void
}) {
  const tags = useQuery(tagQueries.list())
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<number[]>([])
  const title = `Add tags to ${countOf(rowCount, 'transaction')}`
  // A tag's group, as a grey suffix, so two like-named tags tell apart.
  const groupNames = new Map(
    tags.data?.groups.map((group) => [group.id, group.name]),
  )
  const tagList = tags.data?.data ?? []
  const search = query.trim()
  const options = search
    ? aToZ(tagList.filter((tag) => matchesSearch(tag.name, search)))
    : byRecentUse(tagList)
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
      <div className="relative py-1">
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          className="pointer-events-none absolute top-[18px] left-3 text-text-muted"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" />
        </svg>
        <input
          // The popover opens to find a tag, so typing starts at once.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          aria-label="Find a tag"
          placeholder="Find a tag"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
          }}
          className="box-border min-h-11 w-full rounded-[10px] border-0 bg-white/6 pr-3 pl-[38px] text-text field"
        />
      </div>
      <div className="px-3 pt-2 pb-1 text-xs font-semibold text-text-muted">
        {search ? 'Matching tags' : 'Recently used'}
      </div>
      <div
        role="listbox"
        aria-multiselectable="true"
        aria-label="Tags"
        className="flex max-h-72 flex-col overflow-y-auto"
      >
        {options.map((tag) => {
          const selected = chosen.includes(tag.id)
          return (
            <TagOption
              key={tag.id}
              tag={tag}
              group={
                tag.group_id === null ? undefined : groupNames.get(tag.group_id)
              }
              selected={selected}
              disabled={full && !selected}
              onToggle={() => {
                toggle(tag.id)
              }}
            />
          )
        })}
      </div>
      <BulkPopoverFooter
        note={
          error
            ? failedNote(error, 'add the tags')
            : full
              ? tagLimitReached
              : 'Existing tags stay. Nothing is replaced.'
        }
        action={
          chosen.length > 0 ? `Add ${countOf(chosen.length, 'tag')}` : 'Add'
        }
        ready={chosen.length > 0 && !pending}
        onAct={() => {
          onAdd(chosen)
        }}
      />
    </BulkPopover>
  )
}
