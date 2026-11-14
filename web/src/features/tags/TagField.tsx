import { useQuery } from '@tanstack/react-query'
import { type KeyboardEvent, useId, useRef, useState } from 'react'
import type { components } from '@/api/schema'
import { labelClass } from '@/components/ui/fieldStyles'
import { TagDot } from '@/features/tags/TagDot'
import { tagQueries } from '@/features/tags/tagQueries'
import { matchesSearch } from '@/lib/search'
import { aToZ } from '@/lib/tagOrder'

type Tag = components['schemas']['Tag']
type TagChip = components['schemas']['TagChip']

// GLOSSARY: a transaction carries 0–5 tags; the API holds the same limit.
const tagLimit = 5
const recentCount = 5
const matchCount = 6

// Used tags first, last used first, then the rest A–Z, so a new ledger still has something to offer.
const recentlyUsed = (tags: Tag[]) => {
  const used = tags
    .filter((tag) => tag.last_used_at !== null)
    .toSorted((a, b) =>
      (b.last_used_at ?? '').localeCompare(a.last_used_at ?? ''),
    )
  const unused = aToZ(tags.filter((tag) => tag.last_used_at === null))
  return [...used, ...unused].slice(0, recentCount)
}

const optionHoverClass = 'press hover:bg-white/6'

// A combobox over the user's tags, loaded once and filtered here as you type. It only picks
// existing tags: an unknown name is said so, never created.
export function TagField({
  id,
  value,
  onChange,
  known,
  inputRef,
  readOnly,
  invalid,
  describedBy,
  className = '',
  labelClassName = '',
}: {
  id: string
  value: number[]
  onChange: (tagIds: number[]) => void
  // The transaction's own chips, so they show before the tag list loads.
  known: TagChip[]
  // The form's ref for focusing a refused field, and the page's for opening on tags.
  inputRef: (element: HTMLInputElement | null) => void
  readOnly: boolean
  invalid: boolean
  describedBy?: string
  className?: string
  labelClassName?: string
}) {
  const tags = useQuery(tagQueries.list())
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const listId = useId()
  const listLabelId = `${listId}-label`
  const hintId = `${id}-hint`
  const messageId = `${id}-message`

  // Once loaded, the list is the truth: a tag deleted elsewhere drops its chip.
  const byId = new Map<number, TagChip>(
    (tags.data ?? known).map((tag) => [tag.id, tag]),
  )
  const chips = value.flatMap((tagId) => byId.get(tagId) ?? [])
  const full = value.length >= tagLimit
  const search = query.trim()
  const free = (tags.data ?? []).filter((tag) => !value.includes(tag.id))
  const options = full
    ? []
    : search
      ? aToZ(free.filter((tag) => matchesSearch(tag.name, search))).slice(
          0,
          matchCount,
        )
      : recentlyUsed(free)
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0))
  const expanded = open && options.length > 0
  const unknown =
    !full && search !== '' && tags.isSuccess && options.length === 0
  const optionId = (index: number) => `${listId}-${String(index)}`

  const add = (tag: Tag) => {
    onChange([...value, tag.id])
    setQuery('')
    setActive(0)
  }
  const remove = (tagId: number) => {
    onChange(value.filter((kept) => kept !== tagId))
    setActive(0)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = options.length
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      if (count > 0)
        setActive(
          (activeIndex + (event.key === 'ArrowDown' ? 1 : count - 1)) % count,
        )
    } else if (event.key === 'Enter') {
      // Enter picks a tag; it never submits the form.
      event.preventDefault()
      const picked = options[activeIndex]
      if (picked && !readOnly) add(picked)
    } else if (event.key === 'Backspace' && query === '' && !readOnly) {
      const last = value.at(-1)
      if (last !== undefined) remove(last)
    }
  }

  const setRefs = (element: HTMLInputElement | null) => {
    field.current = element
    inputRef(element)
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-2 max-md:flex-none">
        <label htmlFor={id} className={`${labelClass} ${labelClassName}`}>
          Tags
        </label>
        <span
          aria-live="polite"
          className="text-[13px] text-text-muted max-md:hidden"
        >
          {value.length} of {tagLimit}
        </span>
      </div>
      <div
        className={`flex min-h-13 flex-wrap items-center gap-1.5 rounded-xl border border-transparent bg-surface-2 px-2 py-1.5 focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-accent has-aria-invalid:border-danger max-md:min-h-11 max-md:flex-1 max-md:border-0 max-md:bg-transparent max-md:px-0 max-md:focus-within:outline-none`}
      >
        {chips.map((chip) => (
          <span
            key={chip.id}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white/10 pr-1 pl-3 text-sm font-semibold max-md:min-h-8"
          >
            <TagDot colour={chip.colour} />
            {chip.name}
            <button
              type="button"
              aria-label={`Remove tag ${chip.name}`}
              disabled={readOnly}
              onClick={() => {
                remove(chip.id)
                field.current?.focus()
              }}
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-text-muted hover:bg-white/12"
            >
              <svg
                aria-hidden="true"
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              >
                <path d="M2 2l6 6M8 2 2 8" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={setRefs}
          id={id}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded ? optionId(activeIndex) : undefined}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={
            [describedBy, (unknown || full) && messageId, hintId]
              .filter(Boolean)
              .join(' ') || undefined
          }
          autoComplete="off"
          placeholder={
            full
              ? undefined
              : value.length > 0
                ? 'Add a tag'
                : 'Type to find a tag'
          }
          readOnly={readOnly}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
          }}
          onBlur={() => {
            setOpen(false)
          }}
          onKeyDown={onKeyDown}
          className="min-h-9 min-w-0 flex-[1_1_80px] border-0 bg-transparent text-text outline-none max-md:min-h-11 max-md:text-[16px]"
        />
      </div>

      <div
        hidden={!expanded}
        className="mt-0.5 flex flex-col rounded-2xl border border-white/14 bg-popover p-2 shadow-[0_16px_48px_rgba(0,0,0,0.55)] max-md:basis-full"
      >
        <div
          id={listLabelId}
          className="px-3 pt-1 pb-1.5 text-xs font-semibold text-text-muted"
        >
          {search ? 'Matching tags' : 'Recently used'}
        </div>
        <div
          id={listId}
          role="listbox"
          aria-labelledby={listLabelId}
          className="flex flex-col"
        >
          {expanded &&
            options.map((tag, index) => (
              // Keys are handled on the input (aria-activedescendant), so an option needs only the pointer.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <div
                key={tag.id}
                id={optionId(index)}
                role="option"
                tabIndex={-1}
                aria-selected={index === activeIndex}
                // Keeps focus in the input, so the list stays open for the click.
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                onClick={() => {
                  if (!readOnly) add(tag)
                }}
                className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] px-3 ${index === activeIndex ? 'bg-accent-tint font-semibold' : optionHoverClass}`}
              >
                <TagDot colour={tag.colour} />
                <span className="flex-auto wrap-anywhere">{tag.name}</span>
                {index === activeIndex && (
                  <span className="text-xs font-normal text-text-muted">
                    Enter
                  </span>
                )}
              </div>
            ))}
        </div>
      </div>

      {unknown && (
        <div
          id={messageId}
          role="status"
          className="mt-0.5 flex flex-col gap-0.5 rounded-2xl border border-white/14 bg-popover px-4 py-3.5 max-md:basis-full"
        >
          <span className="font-semibold wrap-anywhere">
            No tag named “{search}”
          </span>
          <span className="text-[13px] text-text-muted">
            Save without it and create the tag later on the Tags page.
          </span>
        </div>
      )}
      {full && (
        <div
          id={messageId}
          role="status"
          className="text-[13px] text-text-muted max-md:basis-full max-md:pb-2"
        >
          That’s the limit of 5 tags. Remove one to add another.
        </div>
      )}
      <span id={hintId} className="text-[13px] text-text-muted max-md:hidden">
        Arrow keys move, Enter adds, Backspace removes the last tag.
      </span>
    </div>
  )
}
