import { type FocusEvent, useId, useRef, useState } from 'react'
import type { components } from '@/api/schema'
import { TagDot } from '@/features/tags/TagDot'
import { matchesSearch } from '@/lib/search'
import { aToZ } from '@/lib/tagOrder'

type Tag = components['schemas']['Tag']

const plusIcon = (
  <svg
    aria-hidden="true"
    width="12"
    height="12"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M7 2v10M2 7h10" />
  </svg>
)

const triggerClass =
  'press inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-dashed border-white/22 bg-transparent px-3.5 text-sm text-text-muted disabled:cursor-not-allowed disabled:opacity-50'

// The board's "Filter by tag": the chosen tags as removable chips, and a popover to pick more; all must match.
export function TagFilterPicker({
  tags,
  value,
  limit,
  onChange,
  disabled,
  describedBy,
}: {
  tags: Tag[]
  value: number[]
  limit: number
  onChange: (tagIds: number[]) => void
  disabled: boolean
  describedBy?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const pickerId = useId()

  const chosen = aToZ(tags.filter((tag) => value.includes(tag.id)))
  const options = aToZ(tags.filter((tag) => matchesSearch(tag.name, query)))
  const full = value.length >= limit

  const toggle = (tagId: number) => {
    onChange(
      value.includes(tagId)
        ? value.filter((kept) => kept !== tagId)
        : [...value, tagId],
    )
  }
  const close = () => {
    setOpen(false)
    setQuery('')
  }
  // Focus leaving the trigger and the popover closes it, as a click elsewhere does.
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) close()
  }

  return (
    <div className="contents">
      {chosen.map((tag) => (
        <button
          key={tag.id}
          type="button"
          aria-label={`Remove filter ${tag.name}`}
          onClick={() => {
            toggle(tag.id)
          }}
          className="inline-flex min-h-11 press cursor-pointer items-center gap-2 rounded-full border-0 bg-accent-tint pr-2 pl-3.5 text-sm font-semibold text-text"
        >
          <TagDot colour={tag.colour} />
          {tag.name}
          <svg
            aria-hidden="true"
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="text-text-muted"
          >
            <path d="M2 2l6 6M8 2 2 8" />
          </svg>
        </button>
      ))}
      {/* Only listens for blur from trigger and popover; unpositioned, so the popover hangs from the tag row, on screen. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div className="inline-flex" onBlur={onBlur}>
        <button
          ref={trigger}
          type="button"
          aria-label={value.length > 0 ? 'Add another tag filter' : undefined}
          aria-expanded={open}
          aria-controls={open ? pickerId : undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          onClick={() => {
            if (open) close()
            else setOpen(true)
          }}
          className={triggerClass}
        >
          {plusIcon}
          {value.length === 0 && 'Filter by tag'}
        </button>
        {open && (
          // Escape and presses inside are handled for the whole popover; the keys themselves go to its controls.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
          <div
            id={pickerId}
            role="dialog"
            aria-label="Filter by tag"
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.stopPropagation()
              close()
              trigger.current?.focus()
            }}
            // A press on anything but the search box keeps focus where it is, so no blur closes the popover first.
            onMouseDown={(event) => {
              if (!(event.target instanceof HTMLInputElement))
                event.preventDefault()
            }}
            className="absolute top-full left-0 z-20 mt-2 flex w-72 max-w-full flex-col rounded-[20px] border border-white/14 bg-popover p-2 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
          >
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
                autoComplete="off"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                }}
                className="box-border min-h-11 w-full rounded-[10px] border-0 bg-white/6 pr-3 pl-[38px] text-text field max-md:text-base"
              />
            </div>
            <div
              role="listbox"
              aria-multiselectable="true"
              aria-label="Tags"
              className="flex max-h-72 flex-col overflow-y-auto"
            >
              {options.map((tag) => {
                const selected = value.includes(tag.id)
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
                    <span className="flex-auto wrap-anywhere">{tag.name}</span>
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
            <div
              role="status"
              className="mt-1 border-t border-divider px-3 pt-2.5 pb-1 text-[13px] text-text-muted"
            >
              {full
                ? `That’s the limit of ${String(limit)} tags. Remove one to add another.`
                : 'Shows transactions that carry all chosen tags.'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
