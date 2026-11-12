import { useSuspenseQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { navItems } from '@/features/shell/navItems'
import { UserMenu } from '@/features/shell/UserMenu'

export function TopBar() {
  const { data: session } = useSuspenseQuery(sessionQueries.current())
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-10 hidden border-b border-divider bg-nav backdrop-blur-[24px] backdrop-saturate-[1.8] glass md:block"
    >
      <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-8 py-3 md:max-lg:gap-2.5 md:max-lg:px-6 md:max-lg:py-2">
        {/* Hidden on tablet so all six links and the account button fit one row. */}
        <span className="mr-2 font-[650] tracking-[-0.01em] whitespace-nowrap md:max-lg:hidden">
          my-finance
        </span>
        <div className="flex min-w-0 flex-auto gap-0.5">
          {navItems.map((page) => (
            <NavLink
              key={page.to}
              to={page.to}
              end
              className="inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-text-muted no-underline aria-[current=page]:bg-white/10 aria-[current=page]:font-semibold aria-[current=page]:text-text md:max-lg:min-h-11 md:max-lg:px-2.5"
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
