import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { isUnreachable } from '@/api/client'
import { primaryButtonClass } from '@/components/ui/buttonStyles'
import { TagDot } from '@/features/tags/TagDot'
import { tagLimit, tagLimitReached } from '@/features/tags/tagLimit'
import { tagQueries } from '@/features/tags/tagQueries'
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
    // Escape and presses inside are handled for the whole popover; the keys themselves go to its controls.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="dialog"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onClose()
      }}
      // A press on anything but the search box keeps focus where it is, so no blur closes the popover first.
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault()
      }}
      className="absolute bottom-full left-1/2 mb-3 box-border flex w-[400px] -translate-x-1/2 flex-col rounded-[20px] border border-white/14 bg-popover p-2 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
    >
      <div className="px-3 pt-2 pb-1 font-[650]">{title}</div>
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
          const group =
            tag.group_id === null ? undefined : groupNames.get(tag.group_id)
          return (
            <button
              key={tag.id}
              type="button"
              role="option"
              aria-selected={selected}
              // aria-disabled, not disabled: a disabled button gets no mousedown, so a press on it would blur and close the popover.
              aria-disabled={full && !selected}
              onClick={() => {
                if (selected || !full) toggle(tag.id)
              }}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-3 text-left text-text hover:bg-white/6 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-selected:bg-accent-tint"
            >
              <TagDot colour={tag.colour} />
              <span className="flex-auto wrap-anywhere">
                {tag.name}
                {group && <span className="text-text-muted"> · {group}</span>}
              </span>
              {selected && (
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-accent"
                >
                  <path d="M2.5 7.5 5.5 10.5 11.5 3.5" />
                </svg>
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-divider pt-2.5 pr-1 pb-0.5 pl-3">
        <span role="status" className="text-[13px] text-text-muted">
          {error
            ? isUnreachable(error)
              ? 'Couldn’t add the tags. Try again.'
              : 'Couldn’t add the tags. Reload the page and try again.'
            : full
              ? tagLimitReached
              : 'Existing tags stay. Nothing is replaced.'}
        </span>
        <button
          type="button"
          // aria-disabled keeps it focusable and the popover open, as the options do.
          aria-disabled={chosen.length === 0 || pending}
          onClick={() => {
            if (chosen.length > 0 && !pending) onAdd(chosen)
          }}
          className={`${primaryButtonClass} min-h-11 flex-none px-[18px] text-sm aria-disabled:cursor-not-allowed aria-disabled:opacity-50`}
        >
          {chosen.length > 0 ? `Add ${countOf(chosen.length, 'tag')}` : 'Add'}
        </button>
      </div>
    </div>
  )
}
