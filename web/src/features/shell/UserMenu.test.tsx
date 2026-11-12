import { screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { signedInAs, signedOut } from '@/test/sessionHandlers'

test('the top bar marks the current page', async () => {
  server.use(signedInAs())

  renderApp('/')

  const nav = await screen.findByRole('navigation', { name: 'Main' })
  expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('the user menu opens and closes by keyboard', async () => {
  server.use(signedInAs({ email: 'chris@example.com' }))
  const { user } = renderApp('/')
  const trigger = await screen.findByRole('button', {
    name: 'chris@example.com, account menu',
  })

  trigger.focus()
  await user.keyboard('{Enter}')

  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const menu = screen.getByRole('region', { name: 'Account' })
  expect(menu).toHaveTextContent('Signed in aschris@example.com')
  expect(within(menu).getByRole('link', { name: 'Settings' })).toHaveAttribute(
    'href',
    '/settings',
  )

  await user.keyboard('{Escape}')

  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(
    screen.queryByRole('region', { name: 'Account' }),
  ).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

test('settings opens the settings page', async () => {
  server.use(signedInAs())
  const { user, router } = renderApp('/')

  await user.click(await screen.findByRole('button', { name: /account menu/ }))
  await user.click(screen.getByRole('link', { name: 'Settings' }))

  expect(
    await screen.findByRole('heading', { name: 'Settings' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/settings')
})

test('signing out ends the session and returns to sign in', async () => {
  server.use(
    signedInAs(),
    http.delete('/api/session', () => {
      server.use(signedOut())
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { user, router } = renderApp('/')

  await user.click(await screen.findByRole('button', { name: /account menu/ }))
  await user.click(screen.getByRole('button', { name: 'Sign out' }))

  expect(
    await screen.findByRole('heading', { name: 'Sign in' }),
  ).toBeInTheDocument()
  await router.navigate('/')
  expect(router.state.location.pathname).toBe('/sign-in')
})

test('a failed sign out says so and keeps you signed in', async () => {
  server.use(
    signedInAs(),
    http.delete('/api/session', () => new HttpResponse(null, { status: 500 })),
  )
  const { user, router } = renderApp('/')

  await user.click(await screen.findByRole('button', { name: /account menu/ }))
  await user.click(screen.getByRole('button', { name: 'Sign out' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Couldn’t sign out. Try again.',
  )
  expect(router.state.location.pathname).toBe('/')
})

test('sign out is locked while it runs', async () => {
  server.use(
    signedInAs(),
    http.delete('/api/session', async () => {
      await delay('infinite')
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { user } = renderApp('/')

  await user.click(await screen.findByRole('button', { name: /account menu/ }))
  await user.click(screen.getByRole('button', { name: 'Sign out' }))

  expect(screen.getByRole('button', { name: 'Sign out' })).toBeDisabled()
})
