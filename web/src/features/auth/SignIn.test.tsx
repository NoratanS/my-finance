import { act, screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { expect, onTestFinished, test, vi } from 'vitest'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { type Problem, type Session, signedOut } from '@/test/sessionHandlers'
import { tooManyAttempts } from '@/test/tooManyAttempts'
import type { Credentials } from '@/features/auth/SignInPage'

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
      const body = (await request.json()) as Credentials
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

const signInAnswers = (status: 400 | 401) =>
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

test('a refusal sign in can’t explain says something went wrong', async () => {
  server.use(signedOut(), signInAnswers(400))
  const { user } = renderApp('/sign-in')

  await submitCredentials(user)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Something went wrong. Try again.',
  )
})

test('too many attempts turns the button off for the wait the API asks for', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  server.use(
    signedOut(),
    http.post('/api/session', () => tooManyAttempts({ 'Retry-After': '45' })),
  )
  const { user } = renderApp('/sign-in')

  await submitCredentials(user)

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Too many attempts. Try again in a few minutes.',
  )
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()

  await act(() => vi.advanceTimersByTimeAsync(44_000))
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()

  await act(() => vi.advanceTimersByTimeAsync(1_000))
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('too many attempts with no wait to go by says so and leaves the button on', async () => {
  server.use(
    signedOut(),
    http.post('/api/session', () => tooManyAttempts()),
  )
  const { user } = renderApp('/sign-in')

  await submitCredentials(user)

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Too many attempts. Try again in a few minutes.',
  )
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
})

test('while signing in, the fields and button are locked', async () => {
  server.use(
    signedOut(),
    http.post('/api/session', async () => {
      await delay('infinite')
      return new HttpResponse(null, { status: 201 })
    }),
  )
  const { user } = renderApp('/sign-in')

  await submitCredentials(user)

  const button = await screen.findByRole('button', { name: 'Signing in…' })
  expect(button).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByLabelText('Email')).toHaveAttribute('readonly')
  expect(screen.getByLabelText('Password')).toHaveAttribute('readonly')
})

test('a malformed email and an empty password are caught before sending, focusing the first', async () => {
  server.use(signedOut())
  const { user } = renderApp('/sign-in')

  await user.type(await screen.findByLabelText('Email'), 'marta@example')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByLabelText('Email')).toHaveAccessibleDescription(
    'Enter an email like name@example.com.',
  )
  expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
    'Enter your password.',
  )
  expect(screen.getByLabelText('Email')).toHaveFocus()
})
