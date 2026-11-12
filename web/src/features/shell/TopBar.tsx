import { useSuspenseQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { UserMenu } from '@/features/shell/UserMenu'

// Only pages that exist get a link; the rest of the board's tabs arrive with their milestones.
const pages = [{ to: '/', label: 'Dashboard' }]

export function TopBar() {
  const { data: session } = useSuspenseQuery(sessionQueries.current())
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-10 border-b border-divider bg-nav backdrop-blur-[24px] backdrop-saturate-[1.8] glass"
    >
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-8 py-3">
        <span className="mr-2 font-[650] tracking-[-0.01em]">my-finance</span>
        <div className="flex flex-auto flex-wrap gap-0.5">
          {pages.map((page) => (
            <NavLink
              key={page.to}
              to={page.to}
              end
              className="inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-medium text-text-muted no-underline aria-[current=page]:bg-white/10 aria-[current=page]:font-semibold aria-[current=page]:text-text"
            >
              {page.label}
            </NavLink>
          ))}
        </div>
        <UserMenu email={session.email} />
      </div>
    </nav>
  )
}
