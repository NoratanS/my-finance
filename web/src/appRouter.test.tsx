import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, onTestFinished, test, vi } from 'vitest'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { signedInAs, signedOut } from '@/test/sessionHandlers'

test('a session that ends mid-use returns to sign in and forgets the cached data', async () => {
  server.use(signedInAs())
  const { queryClient, router } = renderApp('/')
  await screen.findByRole('heading', { name: 'Dashboard' })

  server.use(signedOut())
  await queryClient.refetchQueries()

  expect(
    await screen.findByRole('heading', { name: 'Sign in' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/sign-in')
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
})

test('a session check that keeps failing offers to try again', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  server.use(http.get('/api/session', () => HttpResponse.error()))
  const { user } = renderApp('/')
  // The app retries three times with backoff (1 s, 2 s, 4 s) before giving up.
  await act(() => vi.advanceTimersByTimeAsync(10_000))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Something went wrong. Try again.',
  )

  server.use(signedInAs())
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(
    await screen.findByRole('heading', { name: 'Dashboard' }),
  ).toBeInTheDocument()
})
