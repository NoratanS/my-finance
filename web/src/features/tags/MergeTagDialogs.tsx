import { useId, useState, type RefObject } from 'react'
import { isNotFound } from '@/api/client'
import type { components } from '@/api/schema'
import { Alert } from '@/components/ui/Alert'
import { autofocus } from '@/components/ui/autofocus'
import { ghostButtonClass } from '@/components/ui/buttonStyles'
import {
  dialogActionClass,
  dialogClass,
  dialogTitleClass,
  dialogWidthClass,
} from '@/components/ui/dialogStyles'
import { fieldClass, labelClass } from '@/components/ui/fieldStyles'
import { RetryAlert } from '@/components/ui/RetryAlert'
import { CountRow } from '@/features/tags/CountRow'
import type { TagPeriod } from '@/features/tags/tagPeriods'
import { useMergeTag } from '@/features/tags/useMergeTag'
import { aToZ } from '@/lib/tagOrder'

type Tag = components['schemas']['Tag']

// Merge into…: picks the tag to keep among my other tags, A–Z; Continue opens the confirmation.
export function MergePickerDialog({
  ref,
  tag,
  tags,
  gone,
  onPicked,
}: {
  ref: RefObject<HTMLDialogElement | null>
  tag: Tag
  tags: Tag[]
  // Picked before but deleted elsewhere, so left out even before the list reloads.
  gone: Tag | undefined
  onPicked: (target: Tag) => void
}) {
  const others = aToZ(
    tags.filter((other) => other.id !== tag.id && other.id !== gone?.id),
  )
  const [targetId, setTargetId] = useState(others[0]?.id)
  const titleId = useId()
  const selectId = useId()

  const close = () => {
    ref.current?.close()
  }
  const target = others.find((other) => other.id === targetId)

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`${dialogClass} ${dialogWidthClass} p-0`}
    >
      <form
        aria-labelledby={titleId}
        onSubmit={(event) => {
          event.preventDefault()
          if (target) onPicked(target)
        }}
        className="flex flex-col gap-4 p-7"
      >
        <h2 id={titleId} className={`${dialogTitleClass} mb-1`}>
          Merge “{tag.name}” into…
        </h2>
        {gone && (
          <Alert>“{gone.name}” was deleted elsewhere. Pick another tag.</Alert>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={selectId} className={labelClass}>
            Tag to keep
          </label>
          <select
            id={selectId}
            value={targetId === undefined ? '' : String(targetId)}
            onChange={(event) => {
              setTargetId(Number(event.target.value))
            }}
            className={fieldClass}
          >
            {others.map((other) => (
              <option key={other.id} value={String(other.id)}>
                {other.name}
              </option>
            ))}
          </select>
        </div>
        <p className="m-0 text-sm text-text-muted">
          {tag.name}’s transactions get the tag you keep. {tag.name} is then
          removed.
        </p>
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <button type="button" onClick={close} className={ghostButtonClass}>
            Cancel
          </button>
          <button type="submit" className={dialogActionClass}>
            Continue
          </button>
        </div>
      </form>
    </dialog>
  )
}

// Shows what moves before anything changes; merging forgets the tag, so the details close with it.
export function MergeConfirmDialog({
  ref,
  tag,
  target,
  transactionCount,
  period,
  onTargetGone,
}: {
  ref: RefObject<HTMLDialogElement | null>
  tag: Tag
  target: Tag | undefined
  transactionCount: number
  period: TagPeriod
  onTargetGone: () => void
}) {
  const mergeTag = useMergeTag(tag.id, period)
  const titleId = useId()
  const descriptionId = useId()

  const close = () => {
    ref.current?.close()
  }
  const merging = mergeTag.isPending
  const confirm = () => {
    if (!target || merging) return
    // A 404 means a tag is gone: retrying can't help, so the picker opens again.
    mergeTag.mutate(target.id, {
      onError: (error) => {
        if (isNotFound(error)) onTargetGone()
      },
    })
  }

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={`${dialogClass} ${dialogWidthClass} p-7`}
    >
      <div className="flex flex-col gap-4" aria-busy={merging}>
        <h2 id={titleId} className={`${dialogTitleClass} mb-1`}>
          Merge “{tag.name}” into “{target?.name}”?
        </h2>
        <p id={descriptionId} className="m-0 text-text-muted">
          Everything tagged {tag.name} becomes {target?.name}, and the tag{' '}
          {tag.name} is removed. This can’t be undone.
        </p>
        <CountRow
          count={transactionCount}
          says={`${transactionCount === 1 ? 'moves' : 'move'} to ${target?.name ?? ''}`}
        />
        {mergeTag.isError && !isNotFound(mergeTag.error) && (
          <RetryAlert onRetry={confirm}>Couldn’t merge the tags.</RetryAlert>
        )}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <button
            ref={autofocus}
            type="button"
            onClick={close}
            className={ghostButtonClass}
          >
            Cancel
          </button>
          <button
            type="button"
            aria-disabled={merging}
            onClick={confirm}
            className={`${dialogActionClass} aria-disabled:cursor-progress`}
          >
            {merging ? 'Merging…' : 'Merge tags'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
