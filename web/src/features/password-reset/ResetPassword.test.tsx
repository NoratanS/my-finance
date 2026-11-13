import { act, screen } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { expect, onTestFinished, test, vi } from 'vitest'
import type { components } from '@/api/schema'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { type Problem, type Session, signedOut } from '@/test/sessionHandlers'
import { tooManyAttempts } from '@/test/tooManyAttempts'
import type { NewPassword } from '@/features/password-reset/useResetPassword'

type PasswordReset = components['schemas']['PasswordReset']

const notFound = () =>
  HttpResponse.json<Problem>(
    { type: 'about:blank', title: 'Not found', status: 404 },
    { status: 404 },
  )

const resetLink = () =>
  http.get<never, never, PasswordReset | Problem>(
    '/api/password_reset',
    ({ request }) =>
      // The token goes as a query parameter, so the API's log filter masks it.
      new URL(request.url).searchParams.get('token') === 'martas-token'
        ? HttpResponse.json({ email: 'marta@example.com' })
        : notFound(),
  )

const deadLink = () => http.get('/api/password_reset', notFound)

test('the link shows whose password it sets', async () => {
  server.use(signedOut(), resetLink())

  renderApp('/reset/martas-token')

  expect(
    await screen.findByRole('heading', { name: 'Set a new password' }),
  ).toBeInTheDocument()
  expect(screen.getByText('For marta@example.com')).toBeInTheDocument()
  expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(
    'At least 12 characters. A short phrase works well.',
  )
  expect(
    screen.getByText('Saving it signs you out on your other devices.'),
  ).toBeInTheDocument()
  expect(
    screen.getByText('This link works once, within 24 hours of being made.'),
  ).toBeInTheDocument()
})

test('saving the password signs you in and opens the dashboard', async () => {
  let sent: NewPassword | undefined
  server.use(
    signedOut(),
    resetLink(),
    http.patch('/api/password_reset', async ({ request }) => {
      sent = (await request.json()) as NewPassword
      return HttpResponse.json<Session>({
        email: 'marta@example.com',
        admin: false,
        currency: 'PLN',
        currency_locked: false,
      })
    }),
  )
  const { user, router } = renderApp('/reset/martas-token')

  await user.type(
    await screen.findByLabelText('New password'),
    'a long and quiet evening',
  )
  await user.click(screen.getByRole('button', { name: 'Save password' }))

  expect(
    await screen.findByRole('heading', { name: 'Dashboard' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/')
  expect(sent).toEqual({
    token: 'martas-token',
    password: 'a long and quiet evening',
  })
})

test('a password under 12 characters says how long it is, before sending', async () => {
  server.use(signedOut(), resetLink())
  const { user } = renderApp('/reset/martas-token')

  await user.type(await screen.findByLabelText('New password'), 'marta2026')
  await user.click(screen.getByRole('button', { name: 'Save password' }))

  expect(
    await screen.findByLabelText('New password'),
  ).toHaveAccessibleDescription('Use at least 12 characters. This one has 9.')
  expect(screen.getByLabelText('New password')).toHaveFocus()
})

test('while the password saves, the form is locked', async () => {
  server.use(
    signedOut(),
    resetLink(),
    http.patch('/api/password_reset', async () => {
      await delay('infinite')
      return new HttpResponse(null, { status: 200 })
    }),
  )
  const { user } = renderApp('/reset/martas-token')

  await user.type(
    await screen.findByLabelText('New password'),
    'a long and quiet evening',
  )
  await user.click(screen.getByRole('button', { name: 'Save password' }))

  expect(
    await screen.findByRole('button', { name: 'Saving…' }),
  ).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByLabelText('New password')).toHaveAttribute('readonly')
})

test('an expired, used or unknown link says it has expired and offers sign in', async () => {
  server.use(signedOut(), deadLink())

  renderApp('/reset/martas-token')

  expect(
    await screen.findByRole('heading', { name: 'This reset link has expired' }),
  ).toBeInTheDocument()
  expect(
    screen.getByText(
      'Reset links work once and last 24 hours. Ask the person who invited you for a new one.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute(
    'href',
    '/sign-in',
  )
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
})

test('a link that dies before you save switches to the expired state', async () => {
  server.use(
    signedOut(),
    resetLink(),
    http.patch('/api/password_reset', () => {
      server.use(deadLink())
      return notFound()
    }),
  )
  const { user } = renderApp('/reset/martas-token')

  await user.type(
    await screen.findByLabelText('New password'),
    'a long and quiet evening',
  )
  await user.click(screen.getByRole('button', { name: 'Save password' }))

  expect(
    await screen.findByRole('heading', { name: 'This reset link has expired' }),
  ).toBeInTheDocument()
})

test('a password the API refuses says why on the field', async () => {
  server.use(
    signedOut(),
    resetLink(),
    http.patch('/api/password_reset', () =>
      HttpResponse.json<Problem>(
        {
          type: 'about:blank',
          title: 'Check the highlighted fields',
          status: 422,
          errors: { password: ['can’t contain a NUL character'] },
        },
        { status: 422 },
      ),
    ),
  )
  const { user } = renderApp('/reset/martas-token')

  await user.type(
    await screen.findByLabelText('New password'),
    'a long and quiet evening',
  )
  await user.click(screen.getByRole('button', { name: 'Save password' }))

  expect(
    await screen.findByText('can’t contain a NUL character'),
  ).toBeInTheDocument()
  expect(screen.getByLabelText('New password')).toBeInvalid()
})

test('too many attempts turns the button off for the wait the API asks for', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  server.use(
    signedOut(),
    resetLink(),
    http.patch('/api/password_reset', () => tooManyAttempts(45)),
  )
  const { user } = renderApp('/reset/martas-token')

  await user.type(
    await screen.findByLabelText('New password'),
    'a long and quiet evening',
  )
  await user.click(screen.getByRole('button', { name: 'Save password' }))

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Too many attempts. Try again in a few minutes.',
  )
  expect(screen.getByRole('button', { name: 'Save password' })).toBeDisabled()

  await act(() => vi.advanceTimersByTimeAsync(30_000))
  expect(screen.getByRole('button', { name: 'Save password' })).toBeDisabled()

  await act(() => vi.advanceTimersByTimeAsync(15_000))
  expect(screen.getByRole('button', { name: 'Save password' })).toBeEnabled()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('too many attempts with no wait to go by says so and leaves the button on', async () => {
  server.use(
    signedOut(),
    resetLink(),
    http.patch('/api/password_reset', () => tooManyAttempts()),
  )
  const { user } = renderApp('/reset/martas-token')

  await user.type(
    await screen.findByLabelText('New password'),
    'a long and quiet evening',
  )
  await user.click(screen.getByRole('button', { name: 'Save password' }))

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Too many attempts. Try again in a few minutes.',
  )
  expect(screen.getByRole('button', { name: 'Save password' })).toBeEnabled()
})

test('a refusal no field can show still says something went wrong', async () => {
  server.use(
    signedOut(),
    resetLink(),
    http.patch('/api/password_reset', () =>
      HttpResponse.json<Problem>(
        {
          type: 'about:blank',
          title: 'The request body isn’t valid JSON',
          status: 400,
        },
        { status: 400 },
      ),
    ),
  )
  const { user } = renderApp('/reset/martas-token')

  await user.type(
    await screen.findByLabelText('New password'),
    'a long and quiet evening',
  )
  await user.click(screen.getByRole('button', { name: 'Save password' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Something went wrong. Try again.',
  )
})
