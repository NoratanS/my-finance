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

const listedNothing = (period: string) =>
  http.get('/api/transactions', () =>
    HttpResponse.json<TransactionPage>({
      data: [],
      meta: {
        page: 1,
        total_pages: 1,
        total_count: 0,
        period,
        totals: { expense: 0, income: 0, net: 0 },
        untagged_count: 0,
      },
    }),
  )

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

test('Untagged shows the all-time count, narrows the list, and turns the tag filter off while on', async () => {
  const asked = listAsked({ untagged_count: 3 })
  const { user, router } = renderApp('/transactions')

  const untagged = await screen.findByRole('button', { name: 'Untagged · 3' })
  await user.click(untagged)

  expect(untagged).toHaveAttribute('aria-pressed', 'true')
  expect(router.state.location.search).toBe('?untagged=true')
  await vi.waitFor(() => {
    expect(asked.at(-1)).toBe('?untagged=true')
  })
  expect(screen.getByRole('button', { name: 'Filter by tag' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Filter by tag' }),
  ).toHaveAccessibleDescription('Turn off Untagged to filter by tag.')
  await vi.waitFor(() => {
    expect(totals()).toHaveTextContent(
      'October 2026 · all types · untagged only',
    )
  })
})

test('with a tag chosen, Untagged is off', async () => {
  listAsked()

  renderApp('/transactions?tag=3')

  expect(
    await screen.findByRole('button', { name: 'Remove filter Groceries' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Untagged/ })).toBeDisabled()
})

test('a link with tags and Untagged opens on the tags alone', async () => {
  const asked = listAsked()

  renderApp('/transactions?tag=3&untagged=true')

  expect(
    await screen.findByRole('button', { name: 'Remove filter Groceries' }),
  ).toBeInTheDocument()
  expect(asked).toEqual(['?tag_ids[]=3'])
  expect(screen.getByRole('button', { name: /^Untagged/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

test('a tag that is gone drops from the address once the tags load', async () => {
  const asked = listAsked()
  const { router } = renderApp('/transactions?tag=3&tag=404&q=rent')

  await vi.waitFor(() => {
    expect(router.state.location.search).toBe('?tag=3&q=rent')
  })
  await vi.waitFor(() => {
    expect(asked.at(-1)).toBe('?q=rent&tag_ids[]=3')
  })
  expect(screen.getByLabelText('Search descriptions')).toHaveValue('rent')
})

test('the picker takes at most 5 tags', async () => {
  const many = [1, 2, 3, 4, 5, 6].map((id) => tag(id, `Tag ${String(id)}`))
  server.use(http.get('/api/tags', () => HttpResponse.json({ data: many })))
  listAsked()
  const { user } = renderApp('/transactions?tag=1&tag=2&tag=3&tag=4&tag=5')

  await user.click(
    await screen.findByRole('button', { name: 'Add another tag filter' }),
  )
  const picker = screen.getByRole('dialog', { name: 'Filter by tag' })

  expect(within(picker).getByRole('option', { name: 'Tag 6' })).toBeDisabled()
  expect(within(picker).getByRole('status')).toHaveTextContent(
    'That’s the limit of 5 tags. Remove one to add another.',
  )
})

test('Clear filters turns tags and Untagged off too', async () => {
  server.use(listedNothing('2026-10'))
  const { user, router } = renderApp('/transactions?tag=3&tag=7')

  const empty = await screen.findByRole('region', {
    name: 'No transactions match these filters',
  })
  expect(empty).toHaveTextContent(
    'They must carry every chosen tag. Try fewer tags, another month or All time.',
  )
  await user.click(within(empty).getByRole('button', { name: 'Clear filters' }))

  expect(router.state.location.search).toBe('')
})

test('with nothing over all time, the page offers other tags too', async () => {
  server.use(listedNothing('all'))

  renderApp('/transactions?period=all&tag=3')

  expect(
    await screen.findByRole('region', {
      name: 'No transactions match these filters',
    }),
  ).toHaveTextContent('Try a different search, type or tags.')
})

test('a link’s tags the API would refuse are dropped, so it still opens', async () => {
  const asked = listAsked()

  renderApp('/transactions?tag=0&tag=abc&tag=03&tag=3')

  expect(
    await screen.findByRole('button', { name: 'Remove filter Groceries' }),
  ).toBeInTheDocument()
  expect(asked[0]).toBe('?tag_ids[]=3')
})
