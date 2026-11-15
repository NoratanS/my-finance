import type { ReactNode } from 'react'
import { isUnreachable } from '@/api/client'
import { floatingClass } from '@/components/ui/floatingStyles'
import { primaryButtonClass } from '@/components/ui/buttonStyles'
import { TagDot } from '@/features/tags/TagDot'
import type { TagColour } from '@/features/tags/tagColours'

// The shell of the toolbar's Add tags and Remove tags popovers, above the toolbar.
export function BulkPopover({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
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
      // A press on anything but a text box keeps focus where it is, so no blur closes the popover first.
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault()
      }}
      className={`absolute bottom-full left-1/2 mb-3 box-border flex w-[400px] -translate-x-1/2 flex-col rounded-[20px] p-2 ${floatingClass}`}
    >
      <div className="px-3 pt-2 pb-1 font-[650]">{title}</div>
      {children}
    </div>
  )
}

// One tag to pick: its dot, its name with its group, anything the caller adds, and a tick when chosen.
export function TagOption({
  tag,
  group,
  selected,
  disabled,
  autoFocus,
  onToggle,
  children,
}: {
  tag: { name: string; colour: TagColour | null }
  group: string | undefined
  selected: boolean
  disabled: boolean
  autoFocus?: boolean
  onToggle: () => void
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      // aria-disabled, not disabled: a disabled button gets no mousedown, so a press on it would blur and close the popover.
      aria-disabled={disabled}
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus={autoFocus}
      onClick={() => {
        if (!disabled) onToggle()
      }}
      className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-3 text-left text-text hover:bg-white/6 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-selected:bg-accent-tint"
    >
      <TagDot colour={tag.colour} />
      <span className="flex-auto wrap-anywhere">
        {tag.name}
        {group && <span className="text-text-muted"> · {group}</span>}
      </span>
      {children}
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
}

// The popover's foot: a note on what happens (or what went wrong), and the button that does it.
export function BulkPopoverFooter({
  note,
  action,
  ready,
  onAct,
}: {
  note: string
  action: string
  ready: boolean
  onAct: () => void
}) {
  return (
    <div className="mt-1 flex items-center justify-between gap-3 border-t border-divider pt-2.5 pr-1 pb-0.5 pl-3">
      <span role="status" className="text-[13px] text-text-muted">
        {note}
      </span>
      <button
        type="button"
        // aria-disabled keeps it focusable and the popover open, as the options do.
        aria-disabled={!ready}
        onClick={() => {
          if (ready) onAct()
        }}
        className={`${primaryButtonClass} min-h-11 flex-none px-[18px] text-sm aria-disabled:cursor-not-allowed aria-disabled:opacity-50`}
      >
        {action}
      </button>
    </div>
  )
}

// Why the call failed, in the popover's words: "add the tags", "remove the tags".
export const failedNote = (error: unknown, doing: string) =>
  isUnreachable(error)
    ? `Couldn’t ${doing}. Try again.`
    : `Couldn’t ${doing}. Reload the page and try again.`
