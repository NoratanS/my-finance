import { useQuery } from '@tanstack/react-query'
import { healthQueries } from '@/features/health/healthQueries'

export function HealthStatus() {
  const health = useQuery(healthQueries.status())

  return (
    <p role="status" className="text-sm text-neutral-300">
      {health.isPending && 'Checking the API…'}
      {health.isError && 'API unreachable'}
      {health.isSuccess && `API: ${health.data.status}`}
    </p>
  )
}
