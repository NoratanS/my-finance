import { act, screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { expect, onTestFinished, test, vi } from 'vitest'
import type { components } from '@/api/schema'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { type Problem, signedInAs } from '@/test/sessionHandlers'

type Invite = components['schemas']['Invite']
type CreatedInvite = components['schemas']['CreatedInvite']

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

test('the admin sees pending invites with their expiry', async () => {
  server.use(signedInAs({ admin: true }), pendingInvites([piotr, kasia]))

  renderApp('/settings')

  const admin = await screen.findByRole('region', { name: 'Admin' })
  expect(admin).toHaveTextContent('Only you see this section.')
  const pending = await within(admin).findByRole('region', {
    name: 'Pending invites',
  })
  const rows = within(pending).getAllByRole('listitem')
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

test('revoking an invite removes it and says its link no longer works', async () => {
  server.use(
    signedInAs({ admin: true }),
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
