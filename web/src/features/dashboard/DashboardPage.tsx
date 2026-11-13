import { useSuspenseQuery } from '@tanstack/react-query'
import { PageTitle } from '@/components/ui/PageTitle'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { FirstRun } from '@/features/dashboard/FirstRun'
import { formatMonthYear } from '@/lib/dates'

// The dashboard's own slice replaces this first run with real figures.
export function DashboardPage() {
  const { data: session } = useSuspenseQuery(sessionQueries.current())
  return (
    <>
      <header className="flex flex-col gap-1">
        <div className="text-[13px] font-semibold tracking-[0.01em] text-text-muted">
          {formatMonthYear(new Date())}
        </div>
        <PageTitle>Dashboard</PageTitle>
      </header>
      <FirstRun currency={session.currency} />
    </>
  )
}
