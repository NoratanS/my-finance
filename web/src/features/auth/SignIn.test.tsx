import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { type Session, signedOut } from '@/test/sessionHandlers'

test('a visit without a session lands on sign in', async () => {
  server.use(signedOut())

  const { router } = renderApp('/')

  expect(
    await screen.findByRole('heading', { name: 'Sign in' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/sign-in')
})

test('signing in opens the dashboard', async () => {
  server.use(
    signedOut(),
    http.post('/api/session', async ({ request }) => {
      const body = (await request.json()) as { email: string; password: string }
      return HttpResponse.json<Session>(
        { email: body.email, admin: false, currency: 'PLN' },
        { status: 201 },
      )
    }),
  )
  const { user } = renderApp('/sign-in')

  await user.type(await screen.findByLabelText('Email'), 'marta@example.com')
  await user.type(screen.getByLabelText('Password'), 'correct horse battery')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))

  expect(
    await screen.findByRole('heading', { name: 'Dashboard' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /marta@example\.com/ }),
  ).toBeVisible()
})
