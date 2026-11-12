import { screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { signedInAs } from '@/test/sessionHandlers'

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
    within(tabs).queryByRole('link', { name: 'Transactions' }),
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
