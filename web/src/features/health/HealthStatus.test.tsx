import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import type { paths } from '@/api/schema'
import { HealthStatus } from '@/features/health/HealthStatus'
import { server } from '@/test/server'

type Health =
  paths['/api/health']['get']['responses'][200]['content']['application/json']

function renderHealthStatus() {
  // No retries, so a failed request shows the error state at once.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <HealthStatus />
    </QueryClientProvider>,
  )
}

test('shows that the check is running while the API answers', async () => {
  server.use(
    http.get('/api/health', async () => {
      await delay('infinite')
      return HttpResponse.json<Health>({ status: 'ok' })
    }),
  )

  renderHealthStatus()

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Checking the API…',
  )
})

test('shows the API is up when the health check succeeds', async () => {
  server.use(
    http.get('/api/health', () => HttpResponse.json<Health>({ status: 'ok' })),
  )

  renderHealthStatus()

  expect(await screen.findByText('API: ok')).toBeInTheDocument()
})

test('shows the API is unreachable when the health check fails', async () => {
  server.use(
    http.get('/api/health', () => new HttpResponse(null, { status: 500 })),
  )

  renderHealthStatus()

  expect(await screen.findByText('API unreachable')).toBeInTheDocument()
})
