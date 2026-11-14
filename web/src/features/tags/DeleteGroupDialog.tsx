import { useId, type RefObject } from 'react'
import type { components } from '@/api/schema'
import { ghostButtonClass } from '@/components/ui/buttonStyles'
import { dialogClass } from '@/components/ui/dialogStyles'
import { RetryAlert } from '@/components/ui/RetryAlert'
import { TagChips } from '@/features/tags/TagChips'
import { useDeleteTagGroup } from '@/features/tags/useDeleteTagGroup'

type TagGroup = components['schemas']['TagGroup']
type TagChip = components['schemas']['TagChip']

// React's autoFocus fires on mount, before showModal(); the attribute lets the dialog start on Cancel.
const autofocus = (button: HTMLButtonElement | null) => {
  button?.setAttribute('autofocus', '')
}

// Confirms first, naming the tags that move to No group (GLOSSARY: Tag group).
export function DeleteGroupDialog({
  ref,
  group,
  tags,
}: {
  ref: RefObject<HTMLDialogElement | null>
  group: TagGroup | undefined
  tags: TagChip[]
}) {
  const deleteGroup = useDeleteTagGroup()
  const titleId = useId()
  const descriptionId = useId()
  const movesId = useId()

  const close = () => {
    ref.current?.close()
  }
  const deleting = deleteGroup.isPending
  const confirm = () => {
    if (!group || deleting) return
    deleteGroup.mutate(group.id, { onSuccess: close })
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
          Delete the group “{group?.name}”?
        </h2>
        <p id={descriptionId} className="m-0 text-text-muted">
          Its tags move to No group. No tag or transaction is deleted.
        </p>
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-surface-2 px-4 py-3">
            <span id={movesId} className="mr-1 text-[13px] text-text-muted">
              Moves to No group
            </span>
            <TagChips tags={tags} labelledBy={movesId} />
          </div>
        )}
        {deleteGroup.isError && (
          <RetryAlert onRetry={confirm}>Couldn’t delete the group.</RetryAlert>
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
            className="min-h-11 press cursor-pointer rounded-full border border-danger/40 bg-danger/14 px-[18px] text-sm font-[650] text-danger aria-disabled:cursor-progress"
          >
            {deleting ? 'Deleting…' : 'Delete group'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
