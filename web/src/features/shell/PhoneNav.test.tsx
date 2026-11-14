import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { signedInAs, signedOut } from '@/test/sessionHandlers'

test('the tab bar marks the current page and links only pages that exist', async () => {
  server.use(signedInAs())

  renderApp('/')

  const tabs = await screen.findByRole('navigation', { name: 'Tab bar' })
  expect(within(tabs).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(within(tabs).getByRole('button', { name: 'More' })).toHaveAttribute(
    'aria-haspopup',
    'dialog',
  )
  expect(
    within(tabs).getByRole('link', { name: 'Transactions' }),
  ).toHaveAttribute('href', '/transactions')
  expect(
    within(tabs).queryByRole('link', { name: 'Budgets' }),
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('More opens a sheet with the other pages and your account', async () => {
  server.use(signedInAs({ email: 'chris@example.com' }))
  const { user } = renderApp('/')

  await user.click(await screen.findByRole('button', { name: 'More' }))

  const sheet = screen.getByRole('dialog', { name: 'More' })
  const pages = within(sheet).getByRole('navigation', { name: 'More pages' })
  expect(within(pages).getByRole('link', { name: 'Settings' })).toHaveAttribute(
    'href',
    '/settings',
  )
  expect(within(pages).getByRole('link', { name: 'Tags' })).toHaveAttribute(
    'href',
    '/tags',
  )
  expect(
    within(pages).queryByRole('link', { name: 'Subscriptions' }),
  ).not.toBeInTheDocument()
  const account = within(sheet).getByRole('region', { name: 'Account' })
  expect(within(account).getByText('chris@example.com')).toBeInTheDocument()
  expect(
    within(account).getByRole('button', { name: 'Sign out' }),
  ).toBeInTheDocument()
})

test('Done closes the sheet', async () => {
  server.use(signedInAs())
  const { user } = renderApp('/')

  await user.click(await screen.findByRole('button', { name: 'More' }))
  await user.click(screen.getByRole('button', { name: 'Done' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('choosing a page closes the sheet and opens the page', async () => {
  server.use(signedInAs())
  const { user, router } = renderApp('/')

  await user.click(await screen.findByRole('button', { name: 'More' }))
  const sheet = screen.getByRole('dialog', { name: 'More' })
  await user.click(within(sheet).getByRole('link', { name: 'Settings' }))

  expect(
    await screen.findByRole('heading', { name: 'Settings' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/settings')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('signing out from the sheet ends the session', async () => {
  server.use(
    signedInAs(),
    http.delete('/api/session', () => {
      server.use(signedOut())
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { user, router } = renderApp('/')

  await user.click(await screen.findByRole('button', { name: 'More' }))
  const sheet = screen.getByRole('dialog', { name: 'More' })
  await user.click(within(sheet).getByRole('button', { name: 'Sign out' }))

  expect(
    await screen.findByRole('heading', { name: 'Sign in' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/sign-in')
})

test('a reopened sheet forgets a failed sign out', async () => {
  server.use(
    signedInAs(),
    http.delete('/api/session', () => new HttpResponse(null, { status: 500 })),
  )
  const { user } = renderApp('/')
  const more = await screen.findByRole('button', { name: 'More' })

  await user.click(more)
  await user.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Couldn’t sign out. Try again.',
  )
  await user.click(screen.getByRole('button', { name: 'Done' }))
  await user.click(more)

  const sheet = screen.getByRole('dialog', { name: 'More' })
  expect(within(sheet).queryByRole('alert')).not.toBeInTheDocument()
})

test('the sheet closes when the page changes under it', async () => {
  server.use(signedInAs())
  const { user, router } = renderApp('/settings')

  await user.click(await screen.findByRole('button', { name: 'More' }))
  await router.navigate('/')

  expect(
    await screen.findByRole('heading', { name: 'Dashboard' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
