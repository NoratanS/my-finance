import { useSuspenseQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { FirstRun } from '@/features/dashboard/FirstRun'
import { formatCalendarMonth, todayIn } from '@/lib/dates'

// The dashboard's own slice replaces this first run with real figures.
export function DashboardPage() {
  const { data: session } = useSuspenseQuery(sessionQueries.current())
  return (
    <>
      <PageHeader title="Dashboard" className="flex flex-col gap-1">
        <div className="text-[13px] font-semibold tracking-[0.01em] text-text-muted max-md:px-1">
          {formatCalendarMonth(todayIn(session.time_zone).slice(0, 7))}
        </div>
      </PageHeader>
      <FirstRun currency={session.currency} />
    </>
  )
}
