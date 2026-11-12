import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import type { components } from '@/api/schema'
import { Alert } from '@/components/ui/Alert'
import { inviteQueries } from '@/features/settings/inviteQueries'
import { useRevokeInvite } from '@/features/settings/useRevokeInvite'
import { formatDayMonth } from '@/lib/dates'

type Invite = components['schemas']['Invite']

const cardClass = 'flex flex-col rounded-3xl bg-surface'
const titleClass =
  'm-0 text-[17px] leading-[1.25] font-[650] tracking-[-0.008em]'

export function PendingInvites() {
  const invites = useQuery(inviteQueries.pending())
  const revoke = useRevokeInvite()
  const [revokedEmail, setRevokedEmail] = useState<string>()
  const titleId = useId()

  const onRevoke = (invite: Invite) => {
    revoke.mutate(invite, {
      onSuccess: () => {
        setRevokedEmail(invite.email)
      },
    })
  }

  if (invites.isPending) {
    return (
      <section
        aria-labelledby={titleId}
        aria-busy="true"
        className={`${cardClass} gap-3.5 px-8 py-6`}
      >
        <h3 id={titleId} className={titleClass}>
          Pending invites
        </h3>
        <span className="sr-only">Loading pending invites</span>
        {['52%', '44%', '48%'].map((width) => (
          <div
            key={width}
            aria-hidden="true"
            className="flex justify-between gap-4"
          >
            <span
              className="h-3.5 rounded-[7px] bg-white/7"
              style={{ width }}
            />
            <span className="h-3.5 w-[22%] rounded-[7px] bg-white/7" />
          </div>
        ))}
      </section>
    )
  }

  if (invites.isError) {
    return (
      <section
        aria-labelledby={titleId}
        className={`${cardClass} gap-2.5 px-8 py-6`}
      >
        <h3 id={titleId} className={titleClass}>
          Pending invites
        </h3>
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
        >
          <span className="inline-flex items-center gap-2.5 text-sm font-medium text-danger">
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="flex-none"
            >
              <circle cx="8" cy="8" r="6.25" />
              <path d="M8 4.75v3.75M8 11v.1" />
            </svg>
            Couldn’t load pending invites.
          </span>
          <button
            type="button"
            onClick={() => void invites.refetch()}
            className="min-h-11 press cursor-pointer rounded-full border border-divider bg-white/6 px-[18px] text-sm font-semibold text-text"
          >
            Try again
          </button>
        </div>
      </section>
    )
  }

  const empty = invites.data.length === 0
  return (
    <section
      aria-labelledby={titleId}
      className={`${cardClass} ${empty && !revokedEmail ? 'gap-1.5 px-8 py-6' : 'px-6 pt-6 pb-3'}`}
    >
      <div
        className={`flex items-baseline gap-2 ${empty && !revokedEmail ? '' : 'px-2 pb-2'}`}
      >
        <h3 id={titleId} className={titleClass}>
          Pending invites
        </h3>
        {!empty && (
          <span className="text-[13px] text-text-muted">
            {invites.data.length}
          </span>
        )}
      </div>
      {revokedEmail && (
        <div
          role="status"
          className="flex min-h-11 items-center gap-2.5 px-2 py-1.5 text-sm text-text-muted"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-none"
          >
            <path d="M3 8.5 6.5 12 13 4.5" />
          </svg>
          <span>
            Invite for {revokedEmail} revoked. Its link no longer works.
          </span>
        </div>
      )}
      {revoke.isError && <Alert>Couldn’t revoke the invite. Try again.</Alert>}
      {empty ? (
        <p
          className={`m-0 text-sm text-text-muted ${revokedEmail ? 'px-2 pb-3' : ''}`}
        >
          None right now. Invites show here until they’re used, revoked or
          expired.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {invites.data.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border-divider px-2 py-1.5 not-first:border-t hover:bg-white/4"
            >
              <span className="min-w-0 flex-[999_1_220px] font-medium wrap-anywhere">
                {invite.email}
              </span>
              <span className="text-[13px] whitespace-nowrap text-text-muted">
                Expires {formatDayMonth(invite.expires_at)}
              </span>
              <button
                type="button"
                aria-label={`Revoke invite for ${invite.email}`}
                disabled={revoke.isPending}
                onClick={() => {
                  onRevoke(invite)
                }}
                className="min-h-11 press cursor-pointer rounded-full border-0 bg-transparent px-3.5 text-sm font-semibold text-danger disabled:cursor-progress"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
