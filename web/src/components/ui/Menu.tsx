import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'

// Spread on each item a Menu renders: arrow keys move focus, so Tab skips items.
export const menuItemProps = { role: 'menuitem', tabIndex: -1 } as const

// An ARIA menu button. Opening focuses the first item; arrows wrap, Home/End jump;
// Escape and outside clicks close it and return focus to the trigger; Tab closes it and moves on.
export function Menu({
  label,
  triggerLabel,
  triggerClassName,
  trigger,
  panelClassName,
  header,
  children,
}: {
  label: string
  triggerLabel: string
  triggerClassName: string
  trigger: ReactNode
  panelClassName: string
  header?: ReactNode
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const triggerId = useId()

  // Found by id, not ref: items call it, and render may hand it to them.
  const close = () => {
    setOpen(false)
    document.getElementById(triggerId)?.focus()
  }

  useEffect(() => {
    if (!open) return
    const isOutside = (event: Event) =>
      event.target instanceof Node &&
      !containerRef.current?.contains(event.target)
    const closeOnPointer = (event: Event) => {
      if (!isOutside(event)) return
      setOpen(false)
      // After the press has moved focus: back to the trigger, unless it landed on another control.
      setTimeout(() => {
        if (document.activeElement === document.body)
          triggerRef.current?.focus()
      })
    }
    const closeOnFocus = (event: Event) => {
      if (isOutside(event)) setOpen(false)
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnPointer)
    document.addEventListener('focusin', closeOnFocus)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointer)
      document.removeEventListener('focusin', closeOnFocus)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const items = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [],
    )

  const moveFocus = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    const all = items()
    const at = all.indexOf(document.activeElement as HTMLElement)
    const targets: Record<string, number | undefined> = {
      ArrowDown: (at + 1) % all.length,
      ArrowUp: (at - 1 + all.length) % all.length,
      Home: 0,
      End: all.length - 1,
    }
    const next = targets[event.key]
    if (next === undefined) return
    event.preventDefault()
    all[next]?.focus()
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        onClick={() => {
          if (open) {
            setOpen(false)
            return
          }
          flushSync(() => {
            setOpen(true)
          })
          items()[0]?.focus()
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>

      {open && (
        <div className={panelClassName}>
          {header}
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={moveFocus}
            className="flex flex-col"
          >
            {children(close)}
          </div>
        </div>
      )}
    </div>
  )
}
