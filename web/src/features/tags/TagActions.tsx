import { useRef, useState } from 'react'
import type { components } from '@/api/schema'
import { Menu, menuItemClass, menuItemProps } from '@/components/ui/Menu'
import { useModal } from '@/components/ui/useModal'
import { DeleteTagDialog } from '@/features/tags/DeleteTagDialog'
import {
  MergeConfirmDialog,
  MergePickerDialog,
} from '@/features/tags/MergeTagDialogs'
import { RenameTagDialog } from '@/features/tags/RenameTagDialog'
import { TagColourDialog } from '@/features/tags/TagColourDialog'
import type { TagPeriod } from '@/features/tags/tagPeriods'

type Tag = components['schemas']['Tag']

// The details' menu and the dialogs it opens. Merge into… needs another tag to keep.
export function TagActions({
  tag,
  tags,
  transactionCount,
  period,
}: {
  tag: Tag
  tags: Tag[]
  // Every transaction carrying the tag, all time: what follows a rename, moves in a merge or loses it in a delete.
  transactionCount: number
  period: TagPeriod
}) {
  const renameRef = useRef<HTMLDialogElement>(null)
  const rename = useModal(renameRef, 'rename-tag')
  const colourRef = useRef<HTMLDialogElement>(null)
  const colour = useModal(colourRef, 'tag-colour')
  const pickerRef = useRef<HTMLDialogElement>(null)
  const picker = useModal(pickerRef, 'merge-picker')
  const confirmRef = useRef<HTMLDialogElement>(null)
  const confirm = useModal(confirmRef, 'merge-confirm')
  const deleteRef = useRef<HTMLDialogElement>(null)
  const deleteDialog = useModal(deleteRef, 'delete-tag')
  // The tag to keep the confirmation is for.
  const [target, setTarget] = useState<Tag>()
  const canMerge = tags.some((other) => other.id !== tag.id)

  // From one dialog to the next: the first closes, so only one is open.
  const confirmMergeInto = (from: HTMLDialogElement | null, picked: Tag) => {
    from?.close()
    confirm.open(() => {
      setTarget(picked)
    })
  }
  const items = [
    { label: 'Rename', open: rename.open },
    { label: 'Change colour', open: colour.open },
    { label: 'Merge into…', open: picker.open, disabled: !canMerge },
  ]

  return (
    <>
      <Menu
        label={`Actions for ${tag.name}`}
        triggerLabel={`More actions for ${tag.name}: rename, change colour, merge, delete`}
        triggerClassName="inline-flex size-11 flex-none press cursor-pointer items-center justify-center rounded-full border-0 bg-white/6 text-text-muted aria-expanded:bg-white/12 aria-expanded:text-text"
        trigger={
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <circle cx="3" cy="8" r="1.4" />
            <circle cx="8" cy="8" r="1.4" />
            <circle cx="13" cy="8" r="1.4" />
          </svg>
        }
        panelClassName="absolute top-[calc(100%+4px)] right-0 z-20 box-border w-[220px] rounded-2xl border border-white/14 bg-popover p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
      >
        {(close) => (
          <>
            {items.map((item) => (
              <button
                key={item.label}
                {...menuItemProps}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  close()
                  item.open()
                }}
                className={`${menuItemClass} text-text disabled:cursor-not-allowed disabled:text-text-muted`}
              >
                {item.label}
              </button>
            ))}
            <div aria-hidden="true" className="mx-2 my-1 h-px bg-divider" />
            <button
              {...menuItemProps}
              type="button"
              onClick={() => {
                close()
                deleteDialog.open()
              }}
              className={`${menuItemClass} text-danger`}
            >
              Delete tag
            </button>
          </>
        )}
      </Menu>
      <RenameTagDialog
        key={rename.key}
        ref={renameRef}
        tag={tag}
        tags={tags}
        transactionCount={transactionCount}
        onMergeInto={(existing) => {
          confirmMergeInto(renameRef.current, existing)
        }}
      />
      <TagColourDialog key={colour.key} ref={colourRef} tag={tag} />
      <MergePickerDialog
        key={picker.key}
        ref={pickerRef}
        tag={tag}
        tags={tags}
        onPicked={(picked) => {
          confirmMergeInto(pickerRef.current, picked)
        }}
      />
      <MergeConfirmDialog
        key={confirm.key}
        ref={confirmRef}
        tag={tag}
        target={target}
        transactionCount={transactionCount}
        period={period}
      />
      <DeleteTagDialog
        key={deleteDialog.key}
        ref={deleteRef}
        tag={tag}
        transactionCount={transactionCount}
        period={period}
        onMerge={
          canMerge
            ? () => {
                deleteRef.current?.close()
                picker.open()
              }
            : undefined
        }
      />
    </>
  )
}
