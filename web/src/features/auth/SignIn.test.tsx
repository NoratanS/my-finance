import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { signedOut } from '@/test/sessionHandlers'

test('a visit without a session lands on sign in', async () => {
  server.use(signedOut())

  const { router } = renderApp('/')

  expect(
    await screen.findByRole('heading', { name: 'Sign in' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/sign-in')
})
