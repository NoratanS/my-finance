import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'

// Spread on each item a Menu renders: arrow keys move focus, so Tab skips items.
export const menuItemProps = { role: 'menuitem', tabIndex: -1 } as const
// The boards' menu row; callers add size and colour.
export const menuItemClass =
  'flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-3 text-left no-underline hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-offset-[-2px]'

// Keyboard users keep their place: closing returns focus to the trigger, except Tab, which moves on.
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
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const triggerId = useId()

  // Found by id, not ref: items call close, and render hands it to them.
  const focusTrigger = () => document.getElementById(triggerId)?.focus()
  const close = () => {
    setOpen(false)
    focusTrigger()
  }
  const closeOnEscape = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (event.key === 'Escape') close()
  })
  // After the press has moved focus: back to the trigger, unless it landed on another control.
  const closeOnPressOutside = useEffectEvent(() => {
    setOpen(false)
    setTimeout(() => {
      if (document.activeElement === document.body) focusTrigger()
    })
  })

  useEffect(() => {
    if (!open) return
    const isOutside = (event: Event) =>
      event.target instanceof Node &&
      !containerRef.current?.contains(event.target)
    const closeOnPointer = (event: Event) => {
      if (isOutside(event)) closeOnPressOutside()
    }
    const closeOnFocus = (event: Event) => {
      if (isOutside(event)) setOpen(false)
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
