import { useId, useState, type RefObject } from 'react'
import type { components } from '@/api/schema'
import { ghostButtonClass } from '@/components/ui/buttonStyles'
import { dialogClass } from '@/components/ui/dialogStyles'
import { RetryAlert } from '@/components/ui/RetryAlert'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { ColourPicker } from '@/features/tags/ColourPicker'
import { TagDot } from '@/features/tags/TagDot'
import { useEditTag } from '@/features/tags/useEditTag'

type Tag = components['schemas']['Tag']

// One of the 8 colours or No colour, previewed on the tag's chip before saving.
export function TagColourDialog({
  ref,
  tag,
}: {
  ref: RefObject<HTMLDialogElement | null>
  tag: Tag
}) {
  const editTag = useEditTag(tag.id)
  const [colour, setColour] = useState(tag.colour)
  const titleId = useId()

  const close = () => {
    ref.current?.close()
  }
  const saving = editTag.isPending
  const save = () => {
    if (saving) return
    editTag.mutate({ colour }, { onSuccess: close })
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`${dialogClass} w-[min(440px,calc(100%-2rem))] p-7`}
    >
      <form
        aria-labelledby={titleId}
        aria-busy={saving}
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
        className="flex flex-col gap-4"
      >
        <h2
          id={titleId}
          className="m-0 mb-1 text-[22px] leading-[1.2] font-bold tracking-[-0.016em] wrap-anywhere"
        >
          Colour for “{tag.name}”
        </h2>
        {editTag.isError && (
          <RetryAlert onRetry={save}>Couldn’t save the colour.</RetryAlert>
        )}
        <ColourPicker
          labelledBy={titleId}
          value={colour}
          onChange={setColour}
        />
        <div className="flex items-center gap-2.5 text-[13px] text-text-muted">
          Preview
          <span className="inline-flex min-h-[26px] items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-[13px] font-semibold whitespace-nowrap text-text">
            <TagDot colour={colour} size="size-2" />
            {tag.name}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <button type="button" onClick={close} className={ghostButtonClass}>
            Cancel
          </button>
          <SubmitButton
            pending={saving}
            pendingLabel="Saving…"
            className="min-h-11 px-[18px] text-sm"
          >
            Save colour
          </SubmitButton>
        </div>
      </form>
    </dialog>
  )
}
