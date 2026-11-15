import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, test } from 'vitest'
import type { RequestBody } from '@/api/client'
import type { components } from '@/api/schema'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { signedInAs } from '@/test/sessionHandlers'
import { tag, tagsListed } from '@/test/tagHandlers'

type Transaction = components['schemas']['Transaction']
type TransactionPage = components['schemas']['TransactionPage']
type BulkTagging = components['schemas']['BulkTagging']
type BulkTaggingInput = RequestBody<'addTransactionTags'>

const groceries = tag(3, 'Groceries')
const biedronka = tag(7, 'Biedronka')
const food = tag(9, 'Food')

const row = (id: number, description: string): Transaction => ({
  id,
  amount: 1000,
  kind: 'expense',
  date: '2026-10-03',
  description,
  tags: [],
})
const rent = row(1, 'Rent')
const lidl = row(2, 'Lidl')
const cinema = row(3, 'Cinema')

// Page 1 holds Rent and Lidl, page 2 Cinema.
const twoPages = () =>
  http.get('/api/transactions', ({ request }) => {
    const page = new URL(request.url).searchParams.get('page') ?? '1'
    return HttpResponse.json<TransactionPage>({
      data: page === '2' ? [cinema] : [rent, lidl],
      meta: {
        page: Number(page),
        total_pages: 2,
        total_count: 3,
        period: '2026-10',
        totals: { expense: 3000, income: 0, net: -3000 },
        untagged_count: 3,
      },
    })
  })

beforeEach(() => {
  server.use(
    signedInAs({ currency_locked: true }),
    http.get('/api/transaction_months', () =>
      HttpResponse.json<string[]>(['2026-10']),
    ),
    tagsListed([groceries, biedronka, food]),
  )
})

// Every body sent to a bulk endpoint, answered with the given result.
const bulkAsked = (
  endpoint: 'transaction_tag_additions' | 'transaction_tag_removals',
  result: BulkTagging,
) => {
  const bodies: BulkTaggingInput[] = []
  server.use(
    http.post(`/api/${endpoint}`, async ({ request }) => {
      bodies.push((await request.json()) as BulkTaggingInput)
      return HttpResponse.json(result, { status: 201 })
    }),
  )
  return bodies
}

const toolbar = () =>
  screen.getByRole('toolbar', { name: /transactions? selected$/ })

const selectAll = () =>
  screen.getByRole('checkbox', { name: 'Select all on this page' })

test('Select all on this page is mixed while some rows are picked, and picks or clears them all', async () => {
  server.use(twoPages())
  const { user } = renderApp('/transactions')

  await user.click(await screen.findByRole('checkbox', { name: 'Select Rent' }))

  expect(selectAll()).toBePartiallyChecked()
  await user.click(selectAll())
  expect(screen.getByRole('checkbox', { name: 'Select Lidl' })).toBeChecked()
  expect(selectAll()).toBeChecked()
  await user.click(selectAll())
  expect(
    screen.getByRole('checkbox', { name: 'Select Rent' }),
  ).not.toBeChecked()
})

test('the selection clears when the page changes, and stays clear on Back', async () => {
  server.use(twoPages())
  const { user, router } = renderApp('/transactions')

  await user.click(await screen.findByRole('checkbox', { name: 'Select Rent' }))
  await user.click(screen.getByRole('button', { name: 'Next page' }))
  await screen.findByRole('checkbox', { name: 'Select Cinema' })
  await router.navigate(-1)

  expect(
    await screen.findByRole('checkbox', { name: 'Select Rent' }),
  ).not.toBeChecked()
  expect(selectAll()).not.toBePartiallyChecked()
})

test('the selection clears when a filter changes', async () => {
  server.use(twoPages())
  const { user } = renderApp('/transactions')

  await user.click(await screen.findByRole('checkbox', { name: 'Select Rent' }))
  await user.click(screen.getByRole('button', { name: 'Untagged · 3' }))

  expect(
    within(await screen.findByRole('table')).getByRole('checkbox', {
      name: 'Select Rent',
    }),
  ).not.toBeChecked()
})

test('the toolbar counts the selection, offers Add tags and Clear, and Remove tags waits for #62', async () => {
  server.use(twoPages())
  const { user } = renderApp('/transactions')

  await user.click(await screen.findByRole('checkbox', { name: 'Select Rent' }))
  await user.click(screen.getByRole('checkbox', { name: 'Select Lidl' }))

  expect(toolbar()).toHaveAccessibleName('2 transactions selected')
  expect(toolbar()).toHaveTextContent('2 selected')
  expect(
    within(toolbar()).getByRole('button', { name: 'Remove tags' }),
  ).toBeDisabled()
  await user.click(
    within(toolbar()).getByRole('button', { name: 'Clear selection' }),
  )
  expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  expect(selectAll()).not.toBeChecked()
})

test('adding tags sends the rows and tags picked, then says how many got them and how many were skipped', async () => {
  server.use(twoPages())
  const bodies = bulkAsked('transaction_tag_additions', {
    changed: [{ id: 1, tag_ids: [3, 7] }],
    skipped_ids: [2],
  })
  const { user } = renderApp('/transactions')

  await user.click(await screen.findByRole('checkbox', { name: 'Select Rent' }))
  await user.click(screen.getByRole('checkbox', { name: 'Select Lidl' }))
  await user.click(within(toolbar()).getByRole('button', { name: 'Add tags' }))
  const picker = screen.getByRole('dialog', {
    name: 'Add tags to 2 transactions',
  })
  expect(picker).toHaveTextContent('Existing tags stay. Nothing is replaced.')
  await user.type(
    within(picker).getByRole('textbox', { name: 'Find a tag' }),
    'gro',
  )
  await user.click(within(picker).getByRole('option', { name: 'Groceries' }))
  await user.clear(within(picker).getByRole('textbox', { name: 'Find a tag' }))
  await user.click(within(picker).getByRole('option', { name: 'Biedronka' }))
  await user.click(within(picker).getByRole('button', { name: 'Add 2 tags' }))

  expect(
    await screen.findByText('Added Biedronka and Groceries to 1 of 2'),
  ).toBeInTheDocument()
  expect(
    screen.getByText('Skipped 1 transaction that would pass 5 tags.'),
  ).toBeInTheDocument()
  expect(bodies).toEqual([{ transaction_ids: [1, 2], tag_ids: [3, 7] }])
  // The action is done, so the selection and the picker go.
  expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('dialog', { name: /^Add tags/ }),
  ).not.toBeInTheDocument()
})
