import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, test } from 'vitest'
import type { components } from '@/api/schema'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { signedInAs } from '@/test/sessionHandlers'
import { tagsListed } from '@/test/tagHandlers'

type Transaction = components['schemas']['Transaction']
type TransactionPage = components['schemas']['TransactionPage']

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
    tagsListed([]),
  )
})

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
