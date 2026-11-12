import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Fragment, useId } from 'react'
import type { components } from '@/api/schema'
import { Alert } from '@/components/ui/Alert'
import { CopyLink } from '@/components/ui/CopyLink'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { useCreateResetLink } from '@/features/settings/useCreateResetLink'
import { userQueries } from '@/features/settings/userQueries'
import { formatDayMonthYear, formatTime } from '@/lib/dates'

type User = components['schemas']['User']
type ResetLink = components['schemas']['ResetLink']

const cardClass = 'flex flex-col rounded-3xl bg-surface'
const titleClass =
  'm-0 text-[17px] leading-[1.25] font-[650] tracking-[-0.008em]'
// The reset button's width, which your own row keeps empty so the dates line up.
const actionWidthClass = 'w-[158px]'

export function Users() {
  const { data: session } = useSuspenseQuery(sessionQueries.current())
  const users = useQuery(userQueries.list())
  const createResetLink = useCreateResetLink()
  const titleId = useId()

  if (users.isPending) {
    return (
      <section
        aria-labelledby={titleId}
        aria-busy="true"
        className={`${cardClass} gap-3.5 px-8 py-6`}
      >
        <h3 id={titleId} className={titleClass}>
          Users
        </h3>
        <span className="sr-only">Loading users</span>
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

  if (users.isError) {
    return (
      <section
        aria-labelledby={titleId}
        className={`${cardClass} gap-2.5 px-8 py-6`}
      >
        <h3 id={titleId} className={titleClass}>
          Users
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
            Couldn’t load users.
          </span>
          <button
            type="button"
            onClick={() => void users.refetch()}
            className="min-h-11 press cursor-pointer rounded-full border border-divider bg-white/6 px-[18px] text-sm font-semibold text-text"
          >
            Try again
          </button>
        </div>
      </section>
    )
  }

  const isYou = (user: User) => user.email === session.email
  // The latest link opens under the user it was made for.
  const linkFor = (user: User) =>
    createResetLink.variables === user.id ? createResetLink.data : undefined
  return (
    <section
      aria-labelledby={titleId}
      className={`${cardClass} px-6 pt-6 pb-3`}
    >
      <div className="flex flex-col gap-0.5 px-2 pb-2">
        <div className="flex items-baseline gap-2">
          <h3 id={titleId} className={titleClass}>
            Users
          </h3>
          <span className="text-[13px] text-text-muted">
            {users.data.length}
          </span>
        </div>
        <p className="m-0 text-[13px] text-text-muted">
          A reset link works once and expires after 24 hours.
        </p>
      </div>
      {createResetLink.isError && (
        <Alert>Couldn’t create the reset link. Try again.</Alert>
      )}
      <ul className="m-0 flex list-none flex-col p-0">
        {users.data.map((user) => {
          const link = linkFor(user)
          return (
            <Fragment key={user.id}>
              <li className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border-divider px-2 py-1.5 not-first:border-t hover:bg-white/4">
                <span className="inline-flex min-w-0 flex-[999_1_220px] items-center gap-2">
                  <span className="font-medium wrap-anywhere">
                    {user.email}
                  </span>
                  {isYou(user) && (
                    <span className="inline-flex min-h-5.5 items-center rounded-full bg-surface-2 px-2 text-xs font-semibold text-text-muted">
                      You
                    </span>
                  )}
                </span>
                <span className="text-[13px] whitespace-nowrap text-text-muted">
                  Joined {formatDayMonthYear(user.joined_at)}
                </span>
                {isYou(user) ? (
                  <span className={actionWidthClass} />
                ) : (
                  <button
                    type="button"
                    aria-label={`Create reset link for ${user.email}`}
                    disabled={createResetLink.isPending}
                    onClick={() => {
                      createResetLink.mutate(user.id)
                    }}
                    className={`min-h-11 ${actionWidthClass} press cursor-pointer rounded-full border border-divider bg-white/6 px-3.5 text-sm font-semibold text-text disabled:cursor-progress`}
                  >
                    Create reset link
                  </button>
                )}
              </li>
              {link && <ResetLinkRow link={link} />}
            </Fragment>
          )
        })}
      </ul>
    </section>
  )
}

function ResetLinkRow({ link }: { link: ResetLink }) {
  return (
    <li className="mx-2 mt-1 mb-2 list-none">
      <CopyLink
        key={link.token}
        label={`Reset link for ${link.email}`}
        link={`${window.location.origin}/reset/${link.token}`}
      >
        Works once and expires after 24 hours, at {formatTime(link.expires_at)}{' '}
        on {formatDayMonthYear(link.expires_at)}. Send it to them yourself.
      </CopyLink>
    </li>
  )
}
