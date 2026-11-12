import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { type Problem, type Session, signedOut } from '@/test/sessionHandlers'

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

const signInAnswers = (status: 401 | 429) =>
  http.post('/api/session', () =>
    HttpResponse.json<Problem>(
      { type: 'about:blank', title: 'Refused', status },
      { status },
    ),
  )

async function submitCredentials(user: UserEvent) {
  await user.type(await screen.findByLabelText('Email'), 'marta@example.com')
  await user.type(screen.getByLabelText('Password'), 'wrong password!')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

test('a wrong email or password says so and moves focus to the cleared password', async () => {
  server.use(signedOut(), signInAnswers(401))
  const { user } = renderApp('/sign-in')

  await submitCredentials(user)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'That email and password don’t match. Try again.',
  )
  expect(screen.getByLabelText('Password')).toHaveFocus()
  expect(screen.getByLabelText('Password')).toHaveValue('')
})
