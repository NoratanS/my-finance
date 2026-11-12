import { screen, within } from '@testing-library/react'
import { expect, onTestFinished, test, vi } from 'vitest'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { signedInAs } from '@/test/sessionHandlers'

test('a new user lands on the first-run dashboard with one Add transaction action', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 12))
  onTestFinished(() => {
    vi.useRealTimers()
  })
  server.use(signedInAs({ currency: 'EUR' }))

  renderApp('/')

  expect(
    await screen.findByRole('heading', {
      name: 'Start with your first transaction',
    }),
  ).toBeInTheDocument()
  expect(screen.getByText('November 2026')).toBeInTheDocument()
  expect(
    screen.getAllByRole('button', { name: 'Add transaction' }),
  ).toHaveLength(1)
  const emptyState = screen.getByRole('region', {
    name: 'Start with your first transaction',
  })
  expect(emptyState).toHaveTextContent('Amounts are in EUR.')
  expect(
    within(emptyState).getByRole('link', { name: 'settings' }),
  ).toHaveAttribute('href', '/settings')
})
