import { useId, useState, type RefObject } from 'react'
import type { components } from '@/api/schema'
import { autofocus } from '@/components/ui/autofocus'
import {
  ghostButtonClass,
  primaryButtonClass,
} from '@/components/ui/buttonStyles'
import { dialogClass } from '@/components/ui/dialogStyles'
import { fieldClass, labelClass } from '@/components/ui/fieldStyles'
import { RetryAlert } from '@/components/ui/RetryAlert'
import type { TagPeriod } from '@/features/tags/tagPeriods'
import { useMergeTag } from '@/features/tags/useMergeTag'
import { countOf } from '@/lib/countOf'
import { aToZ } from '@/lib/tagOrder'

type Tag = components['schemas']['Tag']

const titleClass =
  'm-0 mb-1 text-[22px] leading-[1.2] font-bold tracking-[-0.016em] wrap-anywhere'

// Merge into…: picks the tag to keep among my other tags, A–Z; Continue opens the confirmation.
export function MergePickerDialog({
  ref,
  tag,
  tags,
  onPicked,
}: {
  ref: RefObject<HTMLDialogElement | null>
  tag: Tag
  tags: Tag[]
  onPicked: (target: Tag) => void
}) {
  const others = aToZ(tags.filter((other) => other.id !== tag.id))
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
      className={`${dialogClass} w-[min(440px,calc(100%-2rem))] p-0`}
    >
      <form
        aria-labelledby={titleId}
        onSubmit={(event) => {
          event.preventDefault()
          if (target) onPicked(target)
        }}
        className="flex flex-col gap-4 p-7"
      >
        <h2 id={titleId} className={titleClass}>
          Merge “{tag.name}” into…
        </h2>
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
          <button
            type="submit"
            className={`${primaryButtonClass} min-h-11 px-[18px] text-sm`}
          >
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
}: {
  ref: RefObject<HTMLDialogElement | null>
  tag: Tag
  target: Tag | undefined
  transactionCount: number
  period: TagPeriod
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
    mergeTag.mutate(target.id)
  }

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={`${dialogClass} w-[min(440px,calc(100%-2rem))] p-7`}
    >
      <div className="flex flex-col gap-4" aria-busy={merging}>
        <h2 id={titleId} className={titleClass}>
          Merge “{tag.name}” into “{target?.name}”?
        </h2>
        <p id={descriptionId} className="m-0 text-text-muted">
          Everything tagged {tag.name} becomes {target?.name}, and the tag{' '}
          {tag.name} is removed. This can’t be undone.
        </p>
        <CountRow
          count={transactionCount}
          says={`move to ${target?.name ?? ''}`}
        />
        {mergeTag.isError && (
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
            className={`${primaryButtonClass} min-h-11 px-[18px] text-sm aria-disabled:cursor-progress`}
          >
            {merging ? 'Merging…' : 'Merge tags'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

// The confirmations' one-line tally: how many transactions, then what happens to them.
export function CountRow({ count, says }: { count: number; says: string }) {
  return (
    <div className="flex justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-2.5">
      <span>{countOf(count, 'transaction')}</span>
      <span className="text-text-muted">{says}</span>
    </div>
  )
}
