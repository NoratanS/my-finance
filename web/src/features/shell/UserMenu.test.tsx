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

test('the user menu is a menu you move through with the arrow keys', async () => {
  server.use(signedInAs({ email: 'chris@example.com' }))
  const { user } = renderApp('/')
  const trigger = await screen.findByRole('button', {
    name: 'chris@example.com, account menu',
  })

  trigger.focus()
  await user.keyboard('{Enter}')

  expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const menu = screen.getByRole('menu', { name: 'Account' })
  const settings = within(menu).getByRole('menuitem', { name: 'Settings' })
  const signOut = within(menu).getByRole('menuitem', { name: 'Sign out' })
  expect(settings).toHaveAttribute('href', '/settings')
  expect(screen.getByRole('navigation', { name: 'Main' })).toHaveTextContent(
    'Signed in aschris@example.com',
  )
  expect(settings).toHaveFocus()
  await user.keyboard('{ArrowDown}')
  expect(signOut).toHaveFocus()
  await user.keyboard('{ArrowDown}')
  expect(settings).toHaveFocus()
  await user.keyboard('{ArrowUp}')
  expect(signOut).toHaveFocus()
  await user.keyboard('{Home}')
  expect(settings).toHaveFocus()
  await user.keyboard('{End}')
  expect(signOut).toHaveFocus()
})

test('Escape closes the user menu and returns focus to it', async () => {
  server.use(signedInAs())
  const { user } = renderApp('/')
  const trigger = await screen.findByRole('button', { name: /account menu/ })
  await user.click(trigger)

  await user.keyboard('{Escape}')

  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

test('a click outside closes the user menu and returns focus to it', async () => {
  server.use(signedInAs())
  const { user } = renderApp('/')
  const trigger = await screen.findByRole('button', { name: /account menu/ })
  await user.click(trigger)

  await user.click(screen.getByRole('heading', { level: 1 }))

  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

test('Tab closes the user menu and moves on', async () => {
  server.use(signedInAs())
  const { user } = renderApp('/')
  const trigger = await screen.findByRole('button', { name: /account menu/ })
  await user.click(trigger)

  await user.tab()

  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(trigger).not.toHaveFocus()
})

test('settings opens the settings page', async () => {
  server.use(signedInAs())
  const { user, router } = renderApp('/')

  await user.click(await screen.findByRole('button', { name: /account menu/ }))
  await user.click(screen.getByRole('menuitem', { name: 'Settings' }))

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
  await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))

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
  await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))

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
  await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))

  expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeDisabled()
})
