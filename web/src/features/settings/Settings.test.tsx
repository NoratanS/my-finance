import { act, screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { expect, onTestFinished, test, vi } from 'vitest'
import type { components } from '@/api/schema'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { type Problem, type Session, signedInAs } from '@/test/sessionHandlers'

type Invite = components['schemas']['Invite']
type CreatedInvite = components['schemas']['CreatedInvite']
type User = components['schemas']['User']
type ResetLink = components['schemas']['ResetLink']

const piotr: Invite = {
  id: 1,
  email: 'piotr@example.com',
  expires_at: '2026-11-15T12:00:00.000Z',
}
const kasia: Invite = {
  id: 2,
  email: 'kasia@example.com',
  expires_at: '2026-11-17T12:00:00.000Z',
}

const pendingInvites = (invites: Invite[]) =>
  http.get('/api/invites', () => HttpResponse.json<Invite[]>(invites))

const chris: User = {
  id: 1,
  email: 'chris@example.com',
  joined_at: '2026-11-02T12:00:00.000Z',
}
const marta: User = {
  id: 2,
  email: 'marta@example.com',
  joined_at: '2026-11-03T12:00:00.000Z',
}
const tomek: User = {
  id: 3,
  email: 'tomek@example.com',
  joined_at: '2026-11-05T12:00:00.000Z',
}

const everyUser = (users: User[]) =>
  http.get('/api/users', () => HttpResponse.json<User[]>(users))

test('a member’s settings have no Admin section', async () => {
  server.use(signedInAs({ email: 'ola@example.com', admin: false }))

  renderApp('/settings')

  expect(
    await screen.findByRole('heading', { name: 'Settings' }),
  ).toBeInTheDocument()
  expect(screen.getByText('ola@example.com', { selector: 'div' })).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: 'Admin' }),
  ).not.toBeInTheDocument()
})

test('saving another currency changes the ledger’s currency', async () => {
  let saved: unknown
  server.use(
    signedInAs({ currency: 'PLN' }),
    http.patch('/api/account', async ({ request }) => {
      saved = await request.json()
      server.use(signedInAs({ currency: 'EUR' }))
      return HttpResponse.json<Session>({
        email: 'marta@example.com',
        admin: false,
        currency: 'EUR',
      })
    }),
  )
  const { user } = renderApp('/settings')

  const ledger = await screen.findByRole('region', { name: 'Ledger' })
  const currency = within(ledger).getByLabelText('Currency')
  expect(currency).toHaveValue('PLN')
  expect(currency).toHaveAccessibleDescription(
    'You can change it until you add your first transaction.',
  )
  await user.selectOptions(currency, 'EUR · Euro')
  await user.click(within(ledger).getByRole('button', { name: 'Save' }))

  await vi.waitFor(() => {
    expect(saved).toEqual({ currency: 'EUR' })
  })
  expect(
    within(ledger).getByRole('button', { name: 'Save' }),
  ).not.toHaveAttribute('aria-disabled', 'true')
  expect(currency).toHaveValue('EUR')
})

test('a refused currency says why on the field and focuses it', async () => {
  server.use(
    signedInAs({ currency: 'PLN' }),
    http.patch('/api/account', () =>
      HttpResponse.json<Problem>(
        {
          type: 'about:blank',
          title: 'Check the highlighted fields',
          status: 422,
          errors: { currency: ['can’t change after your first transaction'] },
        },
        { status: 422 },
      ),
    ),
  )
  const { user } = renderApp('/settings')

  const ledger = await screen.findByRole('region', { name: 'Ledger' })
  const currency = within(ledger).getByLabelText('Currency')
  await user.selectOptions(currency, 'EUR · Euro')
  await user.click(within(ledger).getByRole('button', { name: 'Save' }))

  await vi.waitFor(() => {
    expect(currency).toHaveAccessibleDescription(
      'can’t change after your first transaction',
    )
  })
  await vi.waitFor(() => {
    expect(currency).toHaveFocus()
  })
  expect(within(ledger).queryByRole('alert')).not.toBeInTheDocument()
})

const changePassword = async (
  user: ReturnType<typeof renderApp>['user'],
  current: string,
) => {
  const password = await screen.findByRole('region', { name: 'Password' })
  await user.type(within(password).getByLabelText('Current password'), current)
  await user.type(
    within(password).getByLabelText('New password'),
    'winter lights on the river',
  )
  await user.click(
    within(password).getByRole('button', { name: 'Change password' }),
  )
  return password
}

test('changing the password says the other devices are signed out, and clears the fields', async () => {
  let sent: unknown
  server.use(
    signedInAs(),
    http.patch('/api/password', async ({ request }) => {
      sent = await request.json()
      return HttpResponse.json<Session>({
        email: 'marta@example.com',
        admin: false,
        currency: 'PLN',
      })
    }),
  )
  const { user } = renderApp('/settings')

  const password = await changePassword(user, 'correct horse battery')

  expect(await within(password).findByRole('status')).toHaveTextContent(
    'Password changed. Your other devices are signed out.',
  )
  expect(sent).toEqual({
    current_password: 'correct horse battery',
    password: 'winter lights on the river',
  })
  expect(within(password).getByLabelText('Current password')).toHaveValue('')
  expect(within(password).getByLabelText('New password')).toHaveValue('')
})

test('a wrong current password says so on its field', async () => {
  server.use(
    signedInAs(),
    http.patch('/api/password', () =>
      HttpResponse.json<Problem>(
        {
          type: 'about:blank',
          title: 'Check the highlighted fields',
          status: 422,
          errors: { current_password: ['That isn’t your current password.'] },
        },
        { status: 422 },
      ),
    ),
  )
  const { user } = renderApp('/settings')

  const password = await changePassword(user, 'wrong horse battery')

  const current = within(password).getByLabelText('Current password')
  await vi.waitFor(() => {
    expect(current).toHaveAccessibleDescription(
      'That isn’t your current password.',
    )
  })
  expect(current).toBeInvalid()
  await vi.waitFor(() => {
    expect(current).toHaveFocus()
  })
  expect(within(password).queryByRole('alert')).not.toBeInTheDocument()
})

test('when both password fields are refused, focus goes to the current password', async () => {
  server.use(
    signedInAs(),
    http.patch('/api/password', () =>
      HttpResponse.json<Problem>(
        {
          type: 'about:blank',
          title: 'Check the highlighted fields',
          status: 422,
          errors: {
            current_password: ['That isn’t your current password.'],
            password: ['is too common'],
          },
        },
        { status: 422 },
      ),
    ),
  )
  const { user } = renderApp('/settings')

  const password = await changePassword(user, 'wrong horse battery')

  const current = within(password).getByLabelText('Current password')
  await vi.waitFor(() => {
    expect(within(password).getByLabelText('New password')).toBeInvalid()
  })
  expect(current).toBeInvalid()
  await vi.waitFor(() => {
    expect(current).toHaveFocus()
  })
})

test('too many password attempts say to wait', async () => {
  server.use(
    signedInAs(),
    http.patch('/api/password', () =>
      HttpResponse.json<Problem>(
        {
          type: 'about:blank',
          title: 'Too many attempts. Try again in a few minutes.',
          status: 429,
        },
        { status: 429 },
      ),
    ),
  )
  const { user } = renderApp('/settings')

  const password = await changePassword(user, 'correct horse battery')

  expect(await within(password).findByRole('alert')).toHaveTextContent(
    'Too many attempts. Try again in a few minutes.',
  )
})

test('the admin sees pending invites with their expiry', async () => {
  server.use(
    signedInAs({ admin: true }),
    everyUser([]),
    pendingInvites([piotr, kasia]),
    everyUser([]),
  )

  renderApp('/settings')

  const admin = await screen.findByRole('region', { name: 'Admin' })
  expect(admin).toHaveTextContent('Only you see this section.')
  const pending = await within(admin).findByRole('region', {
    name: 'Pending invites',
  })
  const rows = await within(pending).findAllByRole('listitem')
  expect(rows.map((row) => row.textContent)).toEqual([
    'piotr@example.comExpires 15 NovRevoke',
    'kasia@example.comExpires 17 NovRevoke',
  ])
})

test('with no pending invites, the list says so', async () => {
  server.use(signedInAs({ admin: true }), pendingInvites([]))

  renderApp('/settings')

  expect(
    await screen.findByText(
      'None right now. Invites show here until they’re used, revoked or expired.',
    ),
  ).toBeInTheDocument()
})

test('inviting an email gives a link to copy, and lists the invite', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  server.use(
    signedInAs({ admin: true }),
    everyUser([]),
    pendingInvites([]),
    http.post('/api/invites', () => {
      server.use(pendingInvites([piotr]))
      return HttpResponse.json<CreatedInvite>(
        { ...piotr, expires_at: kasia.expires_at, token: 'q7Kx2mPa9LrT' },
        { status: 201 },
      )
    }),
  )
  const { user } = renderApp('/settings')

  await user.type(
    await screen.findByLabelText('Their email'),
    'piotr@example.com',
  )
  await user.click(screen.getByRole('button', { name: 'Create invite link' }))

  const link = await screen.findByLabelText('Invite link for piotr@example.com')
  const expected = `${window.location.origin}/signup/q7Kx2mPa9LrT`
  expect(link).toHaveValue(expected)
  expect(
    screen.getByText(
      'Works once, until 17 Nov 2026. Send it to them yourself.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByLabelText('Their email')).toHaveValue('')
  expect(
    await screen.findByRole('button', {
      name: 'Revoke invite for piotr@example.com',
    }),
  ).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Copy link' }))

  expect(await navigator.clipboard.readText()).toBe(expected)
  expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()

  await act(() => vi.advanceTimersByTimeAsync(2000))

  expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
})

test('inviting an email that already has an account says so on the field', async () => {
  server.use(
    signedInAs({ admin: true }),
    everyUser([]),
    pendingInvites([]),
    http.post('/api/invites', () =>
      HttpResponse.json<Problem>(
        {
          type: 'about:blank',
          title: 'Check the highlighted fields',
          status: 422,
          errors: { email: ['marta@example.com already has an account.'] },
        },
        { status: 422 },
      ),
    ),
  )
  const { user } = renderApp('/settings')

  await user.type(
    await screen.findByLabelText('Their email'),
    'marta@example.com',
  )
  await user.click(screen.getByRole('button', { name: 'Create invite link' }))

  await vi.waitFor(() => {
    expect(screen.getByLabelText('Their email')).toHaveAccessibleDescription(
      'marta@example.com already has an account.',
    )
  })
  expect(screen.getByLabelText('Their email')).toBeInvalid()
})

test.each([
  [
    'answers with a server error',
    () => new HttpResponse(null, { status: 500 }),
  ],
  ['can’t be reached', () => HttpResponse.error()],
])(
  'inviting when the API %s says it couldn’t reach my-finance',
  async (_, answer) => {
    server.use(
      signedInAs({ admin: true }),
      everyUser([]),
      pendingInvites([]),
      http.post('/api/invites', answer),
    )
    const { user } = renderApp('/settings')

    await user.type(
      await screen.findByLabelText('Their email'),
      'piotr@example.com',
    )
    await user.click(screen.getByRole('button', { name: 'Create invite link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t reach my-finance. Try again.',
    )
  },
)

test('revoking an invite removes it and says its link no longer works', async () => {
  server.use(
    signedInAs({ admin: true }),
    everyUser([]),
    pendingInvites([piotr, kasia]),
    http.delete('/api/invites/:id', ({ params }) => {
      if (params.id === '1') server.use(pendingInvites([kasia]))
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { user } = renderApp('/settings')

  await user.click(
    await screen.findByRole('button', {
      name: 'Revoke invite for piotr@example.com',
    }),
  )

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Invite for piotr@example.com revoked. Its link no longer works.',
  )
  await vi.waitFor(() => {
    expect(
      screen.queryByRole('button', {
        name: 'Revoke invite for piotr@example.com',
      }),
    ).not.toBeInTheDocument()
  })
})

test('pending invites that fail to load offer to try again', async () => {
  server.use(
    signedInAs({ admin: true }),
    everyUser([]),
    http.get('/api/invites', () =>
      HttpResponse.json<Problem>(
        { type: 'about:blank', title: 'Not found', status: 404 },
        { status: 404 },
      ),
    ),
  )
  const { user } = renderApp('/settings')

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Couldn’t load pending invites.',
  )

  server.use(pendingInvites([piotr]))
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(
    await screen.findByRole('button', {
      name: 'Revoke invite for piotr@example.com',
    }),
  ).toBeInTheDocument()
})

test('pending invites show a busy placeholder while they load', async () => {
  server.use(
    signedInAs({ admin: true }),
    everyUser([]),
    http.get('/api/invites', async () => {
      await delay('infinite')
      return HttpResponse.json<Invite[]>([])
    }),
  )

  renderApp('/settings')

  const pending = await screen.findByRole('region', {
    name: 'Pending invites',
  })
  expect(pending).toHaveAttribute('aria-busy', 'true')
  expect(pending).toHaveTextContent('Loading pending invites')
})

test('revoking an invite that was accepted meanwhile just refreshes the list', async () => {
  server.use(
    signedInAs({ admin: true }),
    everyUser([]),
    pendingInvites([piotr, kasia]),
    http.delete('/api/invites/:id', () => {
      server.use(pendingInvites([kasia]))
      return HttpResponse.json<Problem>(
        { type: 'about:blank', title: 'Not found', status: 404 },
        { status: 404 },
      )
    }),
  )
  const { user } = renderApp('/settings')

  await user.click(
    await screen.findByRole('button', {
      name: 'Revoke invite for piotr@example.com',
    }),
  )

  await vi.waitFor(() => {
    expect(
      screen.queryByRole('button', {
        name: 'Revoke invite for piotr@example.com',
      }),
    ).not.toBeInTheDocument()
  })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('when copying is blocked, the link is selected to copy by hand', async () => {
  server.use(
    signedInAs({ admin: true }),
    everyUser([]),
    pendingInvites([]),
    http.post('/api/invites', () =>
      HttpResponse.json<CreatedInvite>(
        { ...piotr, token: 'q7Kx2mPa9LrT' },
        { status: 201 },
      ),
    ),
  )
  const { user } = renderApp('/settings')
  await user.type(
    await screen.findByLabelText('Their email'),
    'piotr@example.com',
  )
  await user.click(screen.getByRole('button', { name: 'Create invite link' }))
  const link = await screen.findByLabelText<HTMLInputElement>(
    'Invite link for piotr@example.com',
  )
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(
    new DOMException('Denied', 'NotAllowedError'),
  )

  await user.click(screen.getByRole('button', { name: 'Copy link' }))

  await vi.waitFor(() => {
    expect(link).toHaveFocus()
  })
  expect([link.selectionStart, link.selectionEnd]).toEqual([
    0,
    link.value.length,
  ])
  expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
})

test('the admin sees every user with the date they joined, and themselves as You', async () => {
  server.use(
    signedInAs({ email: 'chris@example.com', admin: true }),
    pendingInvites([]),
    everyUser([chris, marta, tomek]),
  )

  renderApp('/settings')

  const users = await screen.findByRole('region', { name: 'Users' })
  const rows = await within(users).findAllByRole('listitem')
  expect(users).toHaveTextContent(
    'A reset link works once and expires after 24 hours.',
  )
  expect(rows.map((row) => row.textContent)).toEqual([
    'chris@example.comYouJoined 2 Nov 2026',
    'marta@example.comJoined 3 Nov 2026Create reset link',
    'tomek@example.comJoined 5 Nov 2026Create reset link',
  ])
  expect(
    within(users).queryByRole('button', {
      name: 'Create reset link for chris@example.com',
    }),
  ).not.toBeInTheDocument()
})

test('creating a reset link opens it under that user, ready to copy', async () => {
  server.use(
    signedInAs({ email: 'chris@example.com', admin: true }),
    pendingInvites([]),
    everyUser([chris, marta, tomek]),
    // The API refuses a POST that isn't JSON (its login-CSRF guard), even with no body.
    http.post('/api/users/:userId/reset_links', ({ params, request }) =>
      params.userId === '2' &&
      request.headers.get('Content-Type') === 'application/json'
        ? HttpResponse.json<ResetLink>(
            {
              email: 'marta@example.com',
              token: 'Zp4nW8cVt1Qe',
              expires_at: '2026-11-11T14:30:00.000Z',
            },
            { status: 201 },
          )
        : new HttpResponse(null, { status: 500 }),
    ),
  )
  const { user } = renderApp('/settings')

  await user.click(
    await screen.findByRole('button', {
      name: 'Create reset link for marta@example.com',
    }),
  )

  const link = await screen.findByLabelText('Reset link for marta@example.com')
  const expected = `${window.location.origin}/reset/Zp4nW8cVt1Qe`
  expect(link).toHaveValue(expected)
  expect(
    screen.getByText(
      'Works once and expires after 24 hours, at 14:30 on 11 Nov 2026. Send it to them yourself.',
    ),
  ).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Copy link' }))

  expect(await navigator.clipboard.readText()).toBe(expected)
})

test('a reset link that can’t be created says so', async () => {
  server.use(
    signedInAs({ email: 'chris@example.com', admin: true }),
    pendingInvites([]),
    everyUser([chris, marta]),
    http.post(
      '/api/users/:userId/reset_links',
      () => new HttpResponse(null, { status: 500 }),
    ),
  )
  const { user } = renderApp('/settings')

  await user.click(
    await screen.findByRole('button', {
      name: 'Create reset link for marta@example.com',
    }),
  )

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Couldn’t create the reset link. Try again.',
  )
})

test('users that fail to load offer to try again', async () => {
  server.use(
    signedInAs({ email: 'chris@example.com', admin: true }),
    pendingInvites([]),
    http.get('/api/users', () =>
      HttpResponse.json<Problem>(
        { type: 'about:blank', title: 'Not found', status: 404 },
        { status: 404 },
      ),
    ),
  )
  const { user } = renderApp('/settings')

  const users = await screen.findByRole('region', { name: 'Users' })
  expect(await within(users).findByRole('alert')).toHaveTextContent(
    'Couldn’t load users.',
  )

  server.use(everyUser([chris, marta]))
  await user.click(within(users).getByRole('button', { name: 'Try again' }))

  expect(
    await screen.findByRole('button', {
      name: 'Create reset link for marta@example.com',
    }),
  ).toBeInTheDocument()
})

test('users show a busy placeholder while they load', async () => {
  server.use(
    signedInAs({ email: 'chris@example.com', admin: true }),
    pendingInvites([]),
    http.get('/api/users', async () => {
      await delay('infinite')
      return HttpResponse.json<User[]>([])
    }),
  )

  renderApp('/settings')

  const users = await screen.findByRole('region', { name: 'Users' })
  expect(users).toHaveAttribute('aria-busy', 'true')
  expect(users).toHaveTextContent('Loading users')
})

test('a second reset link for the same user replaces the first', async () => {
  let created = 0
  server.use(
    signedInAs({ email: 'chris@example.com', admin: true }),
    pendingInvites([]),
    everyUser([chris, marta]),
    http.post('/api/users/:userId/reset_links', () => {
      created += 1
      return HttpResponse.json<ResetLink>(
        {
          email: 'marta@example.com',
          token: `token-${String(created)}`,
          expires_at: '2026-11-11T14:30:00.000Z',
        },
        { status: 201 },
      )
    }),
  )
  const { user } = renderApp('/settings')
  const createForMarta = async () => {
    await user.click(
      await screen.findByRole('button', {
        name: 'Create reset link for marta@example.com',
      }),
    )
  }

  await createForMarta()
  expect(
    await screen.findByLabelText('Reset link for marta@example.com'),
  ).toHaveValue(`${window.location.origin}/reset/token-1`)
  await createForMarta()

  await vi.waitFor(() => {
    expect(
      screen.getByLabelText('Reset link for marta@example.com'),
    ).toHaveValue(`${window.location.origin}/reset/token-2`)
  })
})
