import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  doneButtonClass,
  tintedButtonClass,
} from '@/components/ui/buttonStyles'

// How long "Copied" shows before the button resets (Settings states board).
const COPIED_FOR_MS = 2000

// A just-created link to hand over by hand, with a Copy button; children say how long it works.
export function CopyLink({
  label,
  link,
  children,
}: {
  label: string
  link: string
  children: ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(
    () => () => {
      clearTimeout(resetTimer.current)
    },
    [],
  )

  const linkField = useRef<HTMLInputElement>(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // Clipboard blocked (permissions, insecure context): hand over the selected link instead.
      linkField.current?.focus()
      linkField.current?.select()
      return
    }
    setCopied(true)
    clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => {
      setCopied(false)
    }, COPIED_FOR_MS)
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-2.5 rounded-2xl bg-surface-2 p-4"
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={linkField}
          readOnly
          aria-label={label}
          value={link}
          className="box-border min-h-11 min-w-0 flex-[999_1_200px] rounded-xl border border-divider bg-bg px-3 font-mono text-sm text-text field"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className={`inline-flex flex-auto items-center justify-center gap-2 ${copied ? doneButtonClass : tintedButtonClass}`}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={copied ? 1.8 : 1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {copied ? (
              <path d="M3 8.5 6.5 12 13 4.5" />
            ) : (
              <>
                <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
                <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
              </>
            )}
          </svg>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <div className="text-[13px] text-text-muted">{children}</div>
    </div>
  )
}
