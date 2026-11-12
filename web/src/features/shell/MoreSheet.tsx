import { useSuspenseQuery } from '@tanstack/react-query'
import { useId, type Ref } from 'react'
import { Link } from 'react-router'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { navItems } from '@/features/shell/navItems'
import { SignOutButton } from '@/features/shell/SignOutButton'

const rowClass =
  'flex min-h-13 w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-3.5 text-left text-[16px] no-underline hover:bg-white/6 focus-visible:outline-offset-[-2px] active:bg-white/10 disabled:cursor-progress disabled:text-text-muted'

const chevron = (
  <svg
    aria-hidden="true"
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="flex-none text-text-muted"
  >
    <path d="M4.5 2.5 8 6l-3.5 3.5" />
  </svg>
)

// A native modal <dialog>: showModal() gives the focus trap, inert page, Escape and focus return.
export function MoreSheet({ ref }: { ref: Ref<HTMLDialogElement> }) {
  const { data: session } = useSuspenseQuery(sessionQueries.current())
  const titleId = useId()

  const close = (event: { currentTarget: Element }) => {
    event.currentTarget.closest('dialog')?.close()
  }

  const pages = [
    ...navItems.filter((item) => item.phone === 'more'),
    { to: '/settings', label: 'Settings', icon: settingsIcon },
  ]

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="fixed inset-x-0 top-auto bottom-0 m-0 box-border max-h-[calc(100dvh-2rem)] w-full max-w-none overflow-y-auto rounded-t-[28px] border-0 border-t border-white/14 bg-sheet p-0 text-text shadow-[0_-16px_48px_rgba(0,0,0,0.5)] backdrop-blur-[30px] backdrop-saturate-[1.8] glass-sheet backdrop:bg-black/52"
    >
      <div className="flex flex-col gap-4 px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <span
          aria-hidden="true"
          className="h-[5px] w-9 self-center rounded-[3px] bg-white/28"
        />
        <div className="flex items-center gap-2 pl-1">
          <h2
            id={titleId}
            className="m-0 flex-auto text-[22px] leading-[1.2] font-bold tracking-[-0.014em]"
          >
            More
          </h2>
          <button
            type="button"
            onClick={close}
            className="inline-flex min-h-11 press cursor-pointer items-center rounded-full border-0 bg-transparent px-3.5 text-[16px] font-[650] text-accent"
          >
            Done
          </button>
        </div>

        <nav aria-label="More pages">
          <ul className="m-0 list-none overflow-hidden rounded-2xl bg-white/6 p-0">
            {pages.map((page) => (
              <li
                key={page.to}
                className="border-t border-divider first:border-t-0"
              >
                <Link
                  to={page.to}
                  onClick={close}
                  className={`${rowClass} text-text hover:text-text`}
                >
                  <span className="flex text-text-muted [&>svg]:size-5">
                    {page.icon}
                  </span>
                  <span className="flex-auto">{page.label}</span>
                  {chevron}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <section
          aria-label="Account"
          className="overflow-hidden rounded-2xl bg-white/6"
        >
          <div className="box-border flex min-h-15 items-center gap-3 px-3.5 py-2">
            <span
              aria-hidden="true"
              className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-surface-2 font-[650]"
            >
              {session.email.charAt(0).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-auto flex-col">
              <span className="text-xs text-text-muted">Signed in as</span>
              <span className="font-semibold wrap-anywhere">
                {session.email}
              </span>
            </span>
          </div>
          <div className="border-t border-divider">
            <SignOutButton
              className={`${rowClass} font-medium text-accent hover:text-accent [&>svg]:size-5`}
            />
          </div>
        </section>
      </div>
    </dialog>
  )
}

const settingsIcon = (
  <svg
    aria-hidden="true"
    width="20"
    height="20"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7" />
    <circle cx="11" cy="4.5" r="1.5" />
    <circle cx="5" cy="11.5" r="1.5" />
  </svg>
)
