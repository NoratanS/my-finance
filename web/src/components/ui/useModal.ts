import { type RefObject, useState } from 'react'
import { flushSync } from 'react-dom'

// Opens a modal <dialog> with a new key, so each opening is a fresh form with no refusal left from the last one.
// The name keeps sibling dialogs' keys apart.
export function useModal(
  ref: RefObject<HTMLDialogElement | null>,
  name: string,
) {
  const [key, setKey] = useState(0)
  // prepare sets what the dialog is for, in the same render as its new key.
  const open = (prepare?: () => void) => {
    flushSync(() => {
      prepare?.()
      setKey((count) => count + 1)
    })
    ref.current?.showModal()
  }
  return { key: `${name}-${String(key)}`, open }
}
