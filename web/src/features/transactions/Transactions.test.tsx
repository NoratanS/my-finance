import { screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import type { components } from '@/api/schema'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { type Problem, signedInAs } from '@/test/sessionHandlers'

type Transaction = components['schemas']['Transaction']
type TransactionPage = components['schemas']['TransactionPage']

const rent: Transaction = {
  id: 1,
  amount: 210000,
  kind: 'expense',
  date: '2026-10-03',
  description: 'Rent',
}
const salary: Transaction = {
  id: 2,
  amount: 820000,
  kind: 'income',
  date: '2026-10-05',
  description: 'October salary',
}

const listed = (
  data: Transaction[],
  meta: Partial<TransactionPage['meta']> = {},
) =>
  http.get('/api/transactions', () =>
    HttpResponse.json<TransactionPage>({
      data,
      meta: { page: 1, total_pages: 1, total_count: data.length, ...meta },
    }),
  )

test('the list shows this month’s transactions with date, description and amount', async () => {
  server.use(signedInAs({ currency_locked: true }), listed([salary, rent]))

  renderApp('/transactions')

  const table = await screen.findByRole('table')
  const [, ...rows] = within(table).getAllByRole('row')
  expect(rows.map((row) => row.textContent)).toEqual([
    '5 OctOctober salary+8 200,00 PLN',
    '3 OctRent−2 100,00 PLN',
  ])
  expect(screen.getByText('2 transactions · newest first')).toBeInTheDocument()
})

test('the pager moves between pages and keeps the page in the address', async () => {
  const asked: (string | null)[] = []
  server.use(
    signedInAs({ currency_locked: true }),
    http.get('/api/transactions', ({ request }) => {
      const page = new URL(request.url).searchParams.get('page')
      asked.push(page)
      return HttpResponse.json<TransactionPage>({
        data: page === '2' ? [rent] : [salary],
        meta: { page: Number(page ?? 1), total_pages: 2, total_count: 26 },
      })
    }),
  )
  const { user, router } = renderApp('/transactions')

  expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Next page' }))

  expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
  expect(screen.getByRole('cell', { name: 'Rent' })).toBeInTheDocument()
  expect(router.state.location.search).toBe('?page=2')
  expect(asked).toEqual([null, '2'])
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
})

test('with no transactions at all, the page invites the first one', async () => {
  server.use(signedInAs({ currency_locked: false }), listed([]))

  renderApp('/transactions')

  expect(
    await screen.findByRole('heading', {
      name: 'Record your first transaction',
    }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('with transactions in other months only, the page says this month is empty', async () => {
  server.use(signedInAs({ currency_locked: true }), listed([]))

  renderApp('/transactions')

  expect(
    await screen.findByText('Nothing recorded this month yet.'),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: 'Record your first transaction' }),
  ).not.toBeInTheDocument()
})

test('the list says it is loading', async () => {
  server.use(
    signedInAs(),
    http.get('/api/transactions', async () => {
      await delay('infinite')
      return HttpResponse.json(null)
    }),
  )

  renderApp('/transactions')

  expect(await screen.findByText('Loading transactions')).toBeInTheDocument()
})

test('a list that fails to load offers to try again', async () => {
  server.use(
    signedInAs({ currency_locked: true }),
    http.get('/api/transactions', () => {
      server.use(listed([rent]))
      return HttpResponse.json<Problem>(
        { type: 'about:blank', title: 'Not found', status: 404 },
        { status: 404 },
      )
    }),
  )
  const { user } = renderApp('/transactions')

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Couldn’t load transactions.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(await screen.findByRole('cell', { name: 'Rent' })).toBeInTheDocument()
})
