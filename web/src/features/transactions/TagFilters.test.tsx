import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, test, vi } from 'vitest'
import type { components } from '@/api/schema'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { signedInAs } from '@/test/sessionHandlers'

type Tag = components['schemas']['Tag']
type TransactionPage = components['schemas']['TransactionPage']

const tag = (id: number, name: string): Tag => ({
  id,
  name,
  colour: null,
  last_used_at: null,
})
const groceries = tag(3, 'Groceries')
const biedronka = tag(7, 'Biedronka')
const food = tag(9, 'Food')

const rent = {
  id: 1,
  amount: 210000,
  kind: 'expense' as const,
  date: '2026-10-03',
  description: 'Rent',
  tags: [],
}

// Every list request's raw query string, as the client built it, answered with Rent.
function listAsked(meta: Partial<TransactionPage['meta']> = {}) {
  const asked: string[] = []
  server.use(
    http.get('/api/transactions', ({ request }) => {
      asked.push(decodeURIComponent(new URL(request.url).search))
      return HttpResponse.json<TransactionPage>({
        data: [rent],
        meta: {
          page: 1,
          total_pages: 1,
          total_count: 1,
          period: '2026-10',
          totals: { expense: 210000, income: 0, net: -210000 },
          untagged_count: 3,
          ...meta,
        },
      })
    }),
  )
  return asked
}

beforeEach(() => {
  server.use(
    signedInAs({ currency_locked: true }),
    http.get('/api/transaction_months', () =>
      HttpResponse.json<string[]>(['2026-10']),
    ),
    http.get('/api/tags', () =>
      HttpResponse.json({ data: [groceries, biedronka, food] }),
    ),
  )
})

const totals = () =>
  screen.getByRole('region', { name: 'Totals for these filters' })

test('picking tags narrows the list to all of them, keeps them in the address and names them in the caption', async () => {
  const asked = listAsked()
  const { user, router } = renderApp('/transactions')

  await user.click(await screen.findByRole('button', { name: 'Filter by tag' }))
  const picker = screen.getByRole('dialog', { name: 'Filter by tag' })
  await user.click(within(picker).getByRole('option', { name: 'Groceries' }))
  await user.click(within(picker).getByRole('option', { name: 'Biedronka' }))

  expect(router.state.location.search).toBe('?tag=3&tag=7')
  // The array as Rails reads one: tag_ids[] repeated, not a bare tag_ids it would keep only the last of.
  await vi.waitFor(() => {
    expect(asked.at(-1)).toBe('?tag_ids[]=3&tag_ids[]=7')
  })
  expect(
    within(picker).getByRole('option', { name: 'Groceries' }),
  ).toHaveAttribute('aria-selected', 'true')
  expect(
    await screen.findByRole('button', { name: 'Remove filter Biedronka' }),
  ).toBeInTheDocument()
  expect(totals()).toHaveTextContent(
    'October 2026 · all types · Biedronka + Groceries',
  )
})
