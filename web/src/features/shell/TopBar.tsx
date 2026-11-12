import { useSuspenseQuery } from '@tanstack/react-query'
import { sessionQueries } from '@/features/auth/sessionQueries'

export function TopBar() {
  const { data: session } = useSuspenseQuery(sessionQueries.current())
  return (
    <nav aria-label="Main">
      <button type="button" aria-label={`${session.email}, account menu`}>
        {session.email}
      </button>
    </nav>
  )
}
