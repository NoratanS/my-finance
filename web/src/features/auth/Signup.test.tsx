import { screen } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import type { components } from '@/api/schema'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { type Problem, type Session, signedOut } from '@/test/sessionHandlers'
import type { NewAccount } from '@/features/auth/useSignup'

type Signup = components['schemas']['Signup']

const invite = (signup: Partial<Signup> = {}) =>
  http.get('/api/signups/:token', () =>
    HttpResponse.json<Signup>({
      email: 'piotr@example.com',
      status: 'pending',
      expires_at: '2026-11-17T12:00:00.000Z',
      ...signup,
    }),
  )

const unknownInvite = () =>
  http.get('/api/signups/:token', () =>
    HttpResponse.json<Problem>(
      { type: 'about:blank', title: 'Not found', status: 404 },
      { status: 404 },
    ),
  )

test('the invite shows its email locked and PLN preselected', async () => {
  server.use(signedOut(), invite())

  renderApp('/signup/piotrs-token')

  const email = await screen.findByLabelText('Email')
  expect(
    screen.getByRole('heading', { name: 'Create your account' }),
  ).toBeInTheDocument()
  expect(email).toHaveValue('piotr@example.com')
  expect(email).toHaveAttribute('readonly')
  expect(email).toHaveAccessibleDescription(
    'From your invite. It can’t be changed.',
  )
  expect(screen.getByLabelText('Currency')).toHaveDisplayValue(
    'PLN · Polish złoty',
  )
  expect(
    screen.getByText('This invite works once, until 17 Nov 2026.'),
  ).toBeInTheDocument()
})

test('creating the account signs you in and opens the dashboard', async () => {
  let sent: NewAccount | undefined
  server.use(
    signedOut(),
    invite(),
    http.post('/api/signups', async ({ request }) => {
      sent = (await request.json()) as NewAccount
      return HttpResponse.json<Session>(
        { email: 'piotr@example.com', admin: false, currency: 'EUR' },
        { status: 201 },
      )
    }),
  )
  const { user, router } = renderApp('/signup/piotrs-token')

  await user.type(
    await screen.findByLabelText('Password'),
    'tea before the long walk',
  )
  await user.selectOptions(screen.getByLabelText('Currency'), 'EUR')
  await user.click(screen.getByRole('button', { name: 'Create account' }))

  expect(
    await screen.findByRole('heading', { name: 'Dashboard' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/')
  expect(sent).toEqual({
    token: 'piotrs-token',
    password: 'tea before the long walk',
    currency: 'EUR',
  })
})

test('a password under 12 characters says how long it is, before sending', async () => {
  server.use(signedOut(), invite())
  const { user } = renderApp('/signup/piotrs-token')

  await user.type(await screen.findByLabelText('Password'), 'sunflower')
  await user.click(screen.getByRole('button', { name: 'Create account' }))

  expect(await screen.findByLabelText('Password')).toHaveAccessibleDescription(
    'Use at least 12 characters. This one has 9.',
  )
  expect(screen.getByLabelText('Password')).toHaveFocus()
})

test('while the account is created, the form is locked', async () => {
  server.use(
    signedOut(),
    invite(),
    http.post('/api/signups', async () => {
      await delay('infinite')
      return new HttpResponse(null, { status: 201 })
    }),
  )
  const { user } = renderApp('/signup/piotrs-token')

  await user.type(
    await screen.findByLabelText('Password'),
    'tea before the long walk',
  )
  await user.click(screen.getByRole('button', { name: 'Create account' }))

  expect(
    await screen.findByRole('button', { name: 'Creating account…' }),
  ).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByLabelText('Password')).toHaveAttribute('readonly')
  expect(screen.getByLabelText('Currency')).toBeDisabled()
})

test('an expired invite says so instead of showing the form', async () => {
  server.use(signedOut(), invite({ status: 'expired' }))

  renderApp('/signup/piotrs-token')

  expect(
    await screen.findByRole('heading', { name: 'This invite has expired' }),
  ).toBeInTheDocument()
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
})

test('a used invite says so and offers sign in', async () => {
  server.use(signedOut(), invite({ status: 'accepted' }))
  const { user, router } = renderApp('/signup/piotrs-token')

  await user.click(await screen.findByRole('link', { name: 'Go to sign in' }))

  expect(
    await screen.findByRole('heading', { name: 'Sign in' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/sign-in')
})

test('a revoked or mangled link says it isn’t valid', async () => {
  server.use(signedOut(), unknownInvite())

  renderApp('/signup/mangled')

  expect(
    await screen.findByRole('heading', {
      name: 'This invite link isn’t valid',
    }),
  ).toBeInTheDocument()
})

test('an invite that expires before you submit switches to the expired state', async () => {
  server.use(
    signedOut(),
    invite(),
    http.post('/api/signups', () => {
      server.use(invite({ status: 'expired' }))
      return HttpResponse.json<Problem>(
        { type: 'about:blank', title: 'This invite has expired', status: 422 },
        { status: 422 },
      )
    }),
  )
  const { user } = renderApp('/signup/piotrs-token')

  await user.type(
    await screen.findByLabelText('Password'),
    'tea before the long walk',
  )
  await user.click(screen.getByRole('button', { name: 'Create account' }))

  expect(
    await screen.findByRole('heading', { name: 'This invite has expired' }),
  ).toBeInTheDocument()
})
