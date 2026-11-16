import { useQuery } from '@tanstack/react-query'
import { type FocusEvent, useId, useRef, useState } from 'react'
import { floatingClass } from '@/components/ui/floatingStyles'
import { primaryButtonClass } from '@/components/ui/buttonStyles'
import { Toast, toastActionClass, toastLinkClass } from '@/components/ui/Toast'
import type { components } from '@/api/schema'
import { tagLimit } from '@/features/tags/tagLimit'
import { tagQueries } from '@/features/tags/tagQueries'
import { BulkRemovePicker } from '@/features/transactions/BulkRemovePicker'
import { BulkTagPicker } from '@/features/transactions/BulkTagPicker'
import { selectBoxId } from '@/features/transactions/TransactionList'
import {
  type BulkTagging as Result,
  useAddTags,
  useRemoveTags,
  useUndoBulkTagging,
} from '@/features/transactions/useBulkTagging'
import { countOf } from '@/lib/countOf'
import { aToZ } from '@/lib/tagOrder'

const and = new Intl.ListFormat('en', { type: 'conjunction' })

type Transaction = components['schemas']['Transaction']
type Picker = 'add' | 'remove'

// The toolbar's other button, beside the accent one: grey until its picker opens.
const quietButtonClass =
  'cursor-pointer rounded-full border-0 bg-white/10 font-semibold text-text disabled:cursor-not-allowed disabled:opacity-50'

// alreadyTagged: every row showed every picked tag, so an empty result means there was nothing to add.
type Added = {
  result: Result
  tagNames: string
  rows: number
  alreadyTagged: boolean
}
type Removed = { result: Result; removedLabel: string }
type Outcome = { key: number } & (
  ({ action: 'add' } & Added) | ({ action: 'remove' } & Removed)
)

// GLOSSARY: Bulk tagging, on desktop: the floating toolbar over a selection, and the result toast.
export function BulkTagging({
  selected,
  onSelect,
}: {
  // The selected rows of the page shown, with the tags they carry.
  selected: Transaction[]
  onSelect: (ids: number[]) => void
}) {
  const tags = useQuery(tagQueries.list())
  const add = useAddTags()
  const remove = useRemoveTags()
  const [picking, setPicking] = useState<Picker>()
  const [outcome, setOutcome] = useState<Outcome>()
  const addTrigger = useRef<HTMLButtonElement>(null)
  const removeTrigger = useRef<HTMLButtonElement>(null)
  const pickerId = useId()
  const carriesTags = selected.some((row) => row.tags.length > 0)

  // An empty selection (cleared, tagged, or the address moved) has no picker to come back to.
  if (picking && selected.length === 0) setPicking(undefined)
  // Only the picker named: the other one may have opened meanwhile.
  const closePicker = (picker: Picker) => {
    setPicking((open) => (open === picker ? undefined : open))
  }
  // The last error goes on opening, not closing: a call on its way must keep its result for the toast.
  const openPicker = (picker: Picker) => {
    const mutation = picker === 'add' ? add : remove
    if (!mutation.isPending) mutation.reset()
    setPicking(picker)
  }
  const togglePicker = (picker: Picker) => {
    if (picking === picker) closePicker(picker)
    else openPicker(picker)
  }
  // Focus leaving a trigger and its popover closes it, as a click elsewhere does.
  const onBlur = (picker: Picker) => (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) closePicker(picker)
  }
  const addTags = (tagIds: number[]) => {
    const rows = selected.length
    const alreadyTagged = selected.every((row) =>
      tagIds.every((tagId) => row.tags.some((chip) => chip.id === tagId)),
    )
    const names = aToZ(
      (tags.data?.data ?? []).filter((tag) => tagIds.includes(tag.id)),
    ).map((tag) => tag.name)
    add.mutate(
      { transaction_ids: selected.map(({ id }) => id), tag_ids: tagIds },
      {
        // The action is done: the selection and the picker go, the toast says what happened.
        onSuccess: (result) => {
          setOutcome((last) => ({
            key: (last?.key ?? 0) + 1,
            action: 'add',
            result,
            tagNames: and.format(names),
            rows,
            alreadyTagged,
          }))
          setPicking(undefined)
          onSelect([])
        },
      },
    )
  }

  const removeTags = (tagIds: number[]) => {
    const [only] = tagIds
    const removedLabel =
      tagIds.length === 1
        ? (selected.flatMap((row) => row.tags).find((chip) => chip.id === only)
            ?.name ?? '1 tag')
        : countOf(tagIds.length, 'tag')
    remove.mutate(
      { transaction_ids: selected.map(({ id }) => id), tag_ids: tagIds },
      {
        // As for an add: the selection and the picker go, the toast says what happened.
        onSuccess: (result) => {
          setOutcome((last) => ({
            key: (last?.key ?? 0) + 1,
            action: 'remove',
            result,
            removedLabel,
          }))
          setPicking(undefined)
          onSelect([])
        },
      },
    )
  }

  return (
    // Bottom centre, over the list; the toast sits above the toolbar when both show.
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex flex-col items-center gap-3 px-4 max-lg:hidden">
      {outcome?.action === 'add' && (
        <AddResult
          key={outcome.key}
          outcome={outcome}
          onShow={onSelect}
          onDismiss={() => {
            setOutcome(undefined)
          }}
        />
      )}
      {outcome?.action === 'remove' && (
        <RemoveResult
          key={outcome.key}
          outcome={outcome}
          onDismiss={() => {
            setOutcome(undefined)
          }}
        />
      )}
      {selected.length > 0 && (
        <div
          role="toolbar"
          aria-label={`${countOf(selected.length, 'transaction')} selected`}
          className={`pointer-events-auto relative flex items-center gap-1.5 rounded-full py-1.5 pr-1.5 pl-[22px] ${floatingClass}`}
        >
          <span className="mr-3 font-semibold">{selected.length} selected</span>
          {/* Each listens only for blur from its trigger and popover. */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div className="inline-flex" onBlur={onBlur('add')}>
            <button
              ref={addTrigger}
              type="button"
              aria-expanded={picking === 'add'}
              aria-controls={picking === 'add' ? pickerId : undefined}
              onClick={() => {
                togglePicker('add')
              }}
              className={`${picking === 'remove' ? quietButtonClass : primaryButtonClass} inline-flex min-h-11 items-center gap-2 px-[18px] text-sm`}
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
            {picking === 'add' && (
              <div id={pickerId} className="contents">
                <BulkTagPicker
                  rowCount={selected.length}
                  pending={add.isPending}
                  error={add.error}
                  onAdd={addTags}
                  onClose={() => {
                    closePicker('add')
                    addTrigger.current?.focus()
                  }}
                />
              </div>
            )}
          </div>
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div className="inline-flex" onBlur={onBlur('remove')}>
            <button
              ref={removeTrigger}
              type="button"
              // Rows without tags have nothing to remove.
              disabled={!carriesTags}
              aria-expanded={picking === 'remove'}
              aria-controls={picking === 'remove' ? pickerId : undefined}
              onClick={() => {
                togglePicker('remove')
              }}
              className={`${picking === 'remove' ? primaryButtonClass : quietButtonClass} min-h-11 px-[18px] text-sm`}
            >
              Remove tags
            </button>
            {picking === 'remove' && (
              <div id={pickerId} className="contents">
                <BulkRemovePicker
                  rows={selected}
                  pending={remove.isPending}
                  error={remove.error}
                  onRemove={removeTags}
                  onClose={() => {
                    closePicker('remove')
                    removeTrigger.current?.focus()
                  }}
                />
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Clear selection"
            onClick={() => {
              setPicking(undefined)
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
  outcome: { result, tagNames, rows, alreadyTagged },
  onShow,
  onDismiss,
}: {
  outcome: Added
  onShow: (ids: number[]) => void
  onDismiss: () => void
}) {
  const undo = useUndoBulkTagging('add')
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
        changed > 0
          ? `Added ${tagNames} to ${changed === rows ? countOf(rows, 'transaction') : `${String(changed)} of ${String(rows)}`}`
          : skipped === 0 && alreadyTagged
            ? 'Nothing to add: they already have these tags'
            : 'No tags added'
      }
      detail={
        undo.isError
          ? 'Couldn’t undo. Try again.'
          : skipped > 0
            ? `Skipped ${countOf(skipped, 'transaction')} that would pass ${String(tagLimit)} tags.`
            : changed === 0 && !alreadyTagged
              ? 'The transactions or tags changed elsewhere.'
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

// What a removal did, with Undo to put back the links it took.
function RemoveResult({
  outcome: { result, removedLabel },
  onDismiss,
}: {
  outcome: Removed
  onDismiss: () => void
}) {
  const undo = useUndoBulkTagging('remove')
  const changed = result.changed.length

  if (undo.isSuccess) {
    const cameBack = undo.data.changed.length > 0
    const skipped = undo.data.skipped_ids.length
    return (
      // Its own key: a fresh wait, not the one Undo's focus was holding.
      <Toast
        key="undone"
        title={
          cameBack
            ? 'Undone: the tags are back'
            : skipped > 0
              ? 'No tags came back'
              : 'Nothing to undo'
        }
        detail={
          skipped > 0
            ? `Skipped ${countOf(skipped, 'transaction')} that would pass ${String(tagLimit)} tags.`
            : cameBack
              ? undefined
              : 'The transactions or tags changed elsewhere.'
        }
        onDismiss={onDismiss}
      />
    )
  }
  // The picker offered only tags the rows carried, so nothing removed means they changed meanwhile.
  if (changed === 0)
    return (
      <Toast
        title="No tags removed"
        detail="The transactions or tags changed elsewhere."
        onDismiss={onDismiss}
      />
    )
  return (
    <Toast
      title={`Removed ${removedLabel} from ${countOf(changed, 'transaction')}`}
      detail={undo.isError ? 'Couldn’t undo. Try again.' : undefined}
      onDismiss={onDismiss}
    >
      {/* The toolbar that had focus is gone, so focus lands on Undo. */}
      <button
        type="button"
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        aria-disabled={undo.isPending}
        onClick={() => {
          if (!undo.isPending) undo.mutate(result.changed)
        }}
        className={toastActionClass}
      >
        Undo
      </button>
    </Toast>
  )
}
