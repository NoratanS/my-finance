import { useQuery } from '@tanstack/react-query'
import { type FocusEvent, useId, useRef, useState } from 'react'
import { primaryButtonClass } from '@/components/ui/buttonStyles'
import { Toast, toastActionClass, toastLinkClass } from '@/components/ui/Toast'
import { tagLimit } from '@/features/tags/tagLimit'
import { tagQueries } from '@/features/tags/tagQueries'
import { BulkTagPicker } from '@/features/transactions/BulkTagPicker'
import { selectBoxId } from '@/features/transactions/TransactionList'
import {
  type BulkTagging as Result,
  useAddTags,
  useUndoAddTags,
} from '@/features/transactions/useBulkTagging'
import { countOf } from '@/lib/countOf'
import { aToZ } from '@/lib/tagOrder'

const and = new Intl.ListFormat('en', { type: 'conjunction' })

type Outcome = { key: number; result: Result; tagNames: string; rows: number }

// GLOSSARY: Bulk tagging, on desktop: the floating toolbar over a selection, and the result toast.
export function BulkTagging({
  selected,
  onSelect,
}: {
  selected: number[]
  onSelect: (ids: number[]) => void
}) {
  const tags = useQuery(tagQueries.list())
  const add = useAddTags()
  const [picking, setPicking] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>()
  const trigger = useRef<HTMLButtonElement>(null)
  const pickerId = useId()

  // An empty selection (cleared, added to, or the address moved) has no picker to come back to.
  if (picking && selected.length === 0) setPicking(false)
  const closePicker = () => {
    setPicking(false)
  }
  // The last error goes on opening, not closing: an add on its way must keep its result for the toast.
  const openPicker = () => {
    if (!add.isPending) add.reset()
    setPicking(true)
  }
  // Focus leaving the trigger and the popover closes it, as a click elsewhere does.
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) closePicker()
  }
  const addTags = (tagIds: number[]) => {
    const rows = selected.length
    const names = aToZ(
      (tags.data?.data ?? []).filter((tag) => tagIds.includes(tag.id)),
    ).map((tag) => tag.name)
    add.mutate(
      { transaction_ids: selected, tag_ids: tagIds },
      {
        // The action is done: the selection and the picker go, the toast says what happened.
        onSuccess: (result) => {
          setOutcome((last) => ({
            key: (last?.key ?? 0) + 1,
            result,
            tagNames: and.format(names),
            rows,
          }))
          setPicking(false)
          onSelect([])
        },
      },
    )
  }

  return (
    // Bottom centre, over the list; the toast sits above the toolbar when both show.
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex flex-col items-center gap-3 px-4 max-lg:hidden">
      {outcome && (
        <AddResult
          key={outcome.key}
          outcome={outcome}
          onShow={onSelect}
          onDismiss={() => {
            setOutcome(undefined)
          }}
        />
      )}
      {selected.length > 0 && (
        <div
          role="toolbar"
          aria-label={`${countOf(selected.length, 'transaction')} selected`}
          className="pointer-events-auto relative flex items-center gap-1.5 rounded-full border border-white/14 bg-popover py-1.5 pr-1.5 pl-[22px] shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
        >
          <span className="mr-3 font-semibold">{selected.length} selected</span>
          {/* Only listens for blur from trigger and popover. */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div className="inline-flex" onBlur={onBlur}>
            <button
              ref={trigger}
              type="button"
              aria-expanded={picking}
              aria-controls={picking ? pickerId : undefined}
              onClick={() => {
                if (picking) closePicker()
                else openPicker()
              }}
              className={`${primaryButtonClass} inline-flex min-h-11 items-center gap-2 px-[18px] text-sm`}
            >
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
              Add tags
            </button>
            {picking && (
              <div id={pickerId} className="contents">
                <BulkTagPicker
                  rowCount={selected.length}
                  pending={add.isPending}
                  error={add.error}
                  onAdd={addTags}
                  onClose={() => {
                    closePicker()
                    trigger.current?.focus()
                  }}
                />
              </div>
            )}
          </div>
          {/* TODO #62: removing tags in bulk; the endpoint is ready. */}
          <button
            type="button"
            disabled
            className="min-h-11 rounded-full border-0 bg-white/10 px-[18px] text-sm font-semibold text-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            Remove tags
          </button>
          <button
            type="button"
            aria-label="Clear selection"
            onClick={() => {
              closePicker()
              onSelect([])
            }}
            className="inline-flex size-11 press cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-text-muted hover:text-text"
          >
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M2 2l6 6M8 2 2 8" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

// What an addition did, with Show them for the skipped rows and Undo for the links it made.
function AddResult({
  outcome: { result, tagNames, rows },
  onShow,
  onDismiss,
}: {
  outcome: Outcome
  onShow: (ids: number[]) => void
  onDismiss: () => void
}) {
  const undo = useUndoAddTags()
  const changed = result.changed.length
  const skipped = result.skipped_ids.length
  const showSkipped = () => {
    onShow(result.skipped_ids)
    // The rows are on the page already; focusing the first scrolls to it, and keyboard users land there.
    const [firstId] = result.skipped_ids
    if (firstId === undefined) return
    const first = document.getElementById(selectBoxId(firstId))
    first?.focus({ preventScroll: true })
    first?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  if (undo.isSuccess)
    return (
      // Its own key: a fresh wait, not the one Undo's focus was holding.
      <Toast
        key="undone"
        title="Undone: the tags are off again"
        onDismiss={onDismiss}
      />
    )
  return (
    <Toast
      title={
        changed === 0 && skipped === 0
          ? 'Nothing to add: they already have these tags'
          : `Added ${tagNames} to ${changed === rows ? countOf(rows, 'transaction') : `${String(changed)} of ${String(rows)}`}`
      }
      detail={
        undo.isError
          ? 'Couldn’t undo. Try again.'
          : skipped > 0
            ? `Skipped ${countOf(skipped, 'transaction')} that would pass ${String(tagLimit)} tags.`
            : undefined
      }
      onDismiss={onDismiss}
    >
      {/* The toolbar that had focus is gone, so focus lands on the first action; only a key pressed there holds the toast. */}
      {skipped > 0 && (
        <button
          type="button"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          onClick={showSkipped}
          className={toastLinkClass}
        >
          Show them
        </button>
      )}
      {changed > 0 && (
        <button
          type="button"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={skipped === 0}
          aria-disabled={undo.isPending}
          onClick={() => {
            if (!undo.isPending) undo.mutate(result.changed)
          }}
          className={toastActionClass}
        >
          Undo
        </button>
      )}
    </Toast>
  )
}
