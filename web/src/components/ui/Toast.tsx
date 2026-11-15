import {
  type FocusEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useState,
} from 'react'
import { floatingClass } from '@/components/ui/floatingStyles'

// Long enough to reach Undo; held while the pointer is on it, or once a key is pressed in it until focus leaves.
const shownFor = 8000

// The boards' result message: a line, an optional detail, and its actions, leaving on its own.
// The caller places it and gives it a new key per message, which restarts the wait.
export function Toast({
  title,
  detail,
  children,
  onDismiss,
}: {
  title: string
  detail?: string
  children?: ReactNode
  onDismiss: () => void
}) {
  // Focus alone doesn't hold it: a caller may move focus here, and the toast must still leave.
  // Apart, so the pointer leaving doesn't release a toast a keyboard user is working in.
  const [hovered, setHovered] = useState(false)
  const [keyed, setKeyed] = useState(false)
  const held = hovered || keyed
  const dismiss = useEffectEvent(onDismiss)
  useEffect(() => {
    if (held) return
    const timer = setTimeout(dismiss, shownFor)
    return () => {
      clearTimeout(timer)
    }
  }, [held])
  const release = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setKeyed(false)
  }

  return (
    // The listeners only hold the wait; the keys and presses themselves go to its buttons.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="status"
      onMouseEnter={() => {
        setHovered(true)
      }}
      onMouseLeave={() => {
        setHovered(false)
      }}
      onKeyDown={() => {
        setKeyed(true)
      }}
      onBlur={release}
      className={`pointer-events-auto box-border flex w-[440px] max-w-full items-center gap-3.5 rounded-[20px] py-3.5 pr-2 pl-5 ${floatingClass}`}
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-none text-income"
      >
        <circle cx="10" cy="10" r="8" />
        <path d="M6.5 10.5 9 13l4.5-5.5" />
      </svg>
      <span className="flex min-w-0 flex-auto flex-col">
        <span className="font-semibold">{title}</span>
        {detail && (
          <span className="text-[13px] text-text-muted">{detail}</span>
        )}
      </span>
      {children}
    </div>
  )
}

// A toast's quiet action (Show them) and its main one (Undo).
export const toastLinkClass =
  'min-h-11 press cursor-pointer rounded-full border-0 bg-transparent px-3 text-sm font-semibold text-accent'
export const toastActionClass =
  'min-h-11 press cursor-pointer rounded-full border-0 bg-white/10 px-3.5 text-sm font-semibold text-text'
