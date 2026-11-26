import { screen } from '@testing-library/react'
import { expect, onTestFinished, test, vi } from 'vitest'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { signedInAs } from '@/test/sessionHandlers'

// The device is still in October; the user's own zone has already turned to November.
test('the dashboard heads with this month in the user’s time zone, not the device’s', async () => {
  vi.stubEnv('TZ', 'America/Los_Angeles')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-31T23:30:00Z'))
  onTestFinished(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })
  server.use(signedInAs({ time_zone: 'Europe/Warsaw' }))

  renderApp('/')

  expect(await screen.findByText('November 2026')).toBeInTheDocument()
  expect(screen.queryByText('October 2026')).not.toBeInTheDocument()
})
