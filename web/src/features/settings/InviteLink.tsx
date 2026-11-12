import { useEffect, useRef, useState } from 'react'
import type { components } from '@/api/schema'
import { formatDayMonthYear } from '@/lib/dates'

type CreatedInvite = components['schemas']['CreatedInvite']

// How long "Copied" shows before the button resets (Settings states board).
const COPIED_FOR_MS = 2000

export function InviteLink({ invite }: { invite: CreatedInvite }) {
  const link = `${window.location.origin}/signup/${invite.token}`
  const label = `Invite link for ${invite.email}`
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(
    () => () => {
      clearTimeout(resetTimer.current)
    },
    [],
  )

  const copy = async () => {
    await navigator.clipboard.writeText(link)
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
          readOnly
          aria-label={label}
          value={link}
          className="box-border min-h-11 min-w-0 flex-[999_1_200px] rounded-xl border border-divider bg-bg px-3 font-mono text-sm text-text field"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className={`inline-flex min-h-11 flex-auto press cursor-pointer items-center justify-center gap-2 rounded-full border-0 px-[18px] text-sm font-[650] ${copied ? 'bg-income/16 text-income' : 'bg-accent-tint text-accent'}`}
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
      <div className="text-[13px] text-text-muted">
        Works once, until {formatDayMonthYear(invite.expires_at)}. Send it to
        them yourself.
      </div>
    </div>
  )
}
