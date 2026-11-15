import { useId, type RefObject } from 'react'
import type { components } from '@/api/schema'
import { autofocus } from '@/components/ui/autofocus'
import {
  dangerButtonClass,
  ghostButtonClass,
  tintedButtonClass,
} from '@/components/ui/buttonStyles'
import { dialogClass } from '@/components/ui/dialogStyles'
import { labelClass } from '@/components/ui/fieldStyles'
import { RetryAlert } from '@/components/ui/RetryAlert'
import { CountRow } from '@/features/tags/MergeTagDialogs'
import type { TagPeriod } from '@/features/tags/tagPeriods'
import { useDeleteTag } from '@/features/tags/useDeleteTag'

type Tag = components['schemas']['Tag']

// Confirms first, saying how many transactions lose the tag, and offers to merge it instead.
export function DeleteTagDialog({
  ref,
  tag,
  transactionCount,
  period,
  onMerge,
}: {
  ref: RefObject<HTMLDialogElement | null>
  tag: Tag
  transactionCount: number
  period: TagPeriod
  // None when there is no other tag to merge into.
  onMerge: (() => void) | undefined
}) {
  const deleteTag = useDeleteTag(tag.id, period)
  const titleId = useId()
  const descriptionId = useId()
  const mergeId = useId()

  const close = () => {
    ref.current?.close()
  }
  const deleting = deleteTag.isPending
  const confirm = () => {
    if (deleting) return
    deleteTag.mutate()
  }

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={`${dialogClass} w-[min(440px,calc(100%-2rem))] p-7`}
    >
      <div className="flex flex-col gap-4" aria-busy={deleting}>
        <h2
          id={titleId}
          className="m-0 text-[22px] leading-[1.2] font-bold tracking-[-0.016em] wrap-anywhere"
        >
          Delete the tag “{tag.name}”?
        </h2>
        <p id={descriptionId} className="m-0 text-text-muted">
          The transactions stay. They lose this tag, and this can’t be undone.
        </p>
        <CountRow count={transactionCount} says="lose the tag" />
        {onMerge && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span id={mergeId} className={labelClass}>
              Or keep everything by merging it into another tag
            </span>
            <button
              type="button"
              aria-describedby={mergeId}
              onClick={onMerge}
              className={tintedButtonClass}
            >
              Merge…
            </button>
          </div>
        )}
        {deleteTag.isError && (
          <RetryAlert onRetry={confirm}>Couldn’t delete the tag.</RetryAlert>
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
            aria-disabled={deleting}
            onClick={confirm}
            className={dangerButtonClass}
          >
            {deleting ? 'Deleting…' : 'Delete tag'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
