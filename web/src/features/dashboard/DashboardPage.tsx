import { useSuspenseQuery } from '@tanstack/react-query'
import { PageTitle } from '@/components/ui/PageTitle'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { FirstRun } from '@/features/dashboard/FirstRun'

const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
})

// No transactions exist before M2, so the dashboard is always its first run.
export function DashboardPage() {
  const { data: session } = useSuspenseQuery(sessionQueries.current())
  return (
    <>
      <header className="flex flex-col gap-1">
        <div className="text-[13px] font-semibold tracking-[0.01em] text-text-muted">
          {monthFormat.format(new Date())}
        </div>
        <PageTitle>Dashboard</PageTitle>
      </header>
      <FirstRun currency={session.currency} />
    </>
  )
}
