import { screen, waitFor, within } from '@testing-library/react'
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
const bakery = row(4, 'Bakery')
const taxi = row(5, 'Taxi')

beforeEach(() => {
  server.use(
    http.get('/api/transaction_months', () =>
      HttpResponse.json<string[]>(['2026-10']),
    ),
    tagsListed([]),
  )
})

// The API over these rows, three to a page: a delete removes one, and a page past the end shows the nearest one.
const stored = (rows: Transaction[]) => {
  let kept = [...rows]
  server.use(
    signedInAs({ currency_locked: true }),
    http.get('/api/transactions', ({ request }) => {
      const totalPages = Math.max(1, Math.ceil(kept.length / 3))
      const asked = Number(new URL(request.url).searchParams.get('page') ?? 1)
      const page = Math.min(asked, totalPages)
      return HttpResponse.json<TransactionPage>({
        data: kept.slice((page - 1) * 3, page * 3),
        meta: {
          page,
          total_pages: totalPages,
          total_count: kept.length,
          period: '2026-10',
          totals: { expense: kept.length * 1000, income: 0, net: 0 },
          untagged_count: kept.length,
        },
      })
    }),
    http.delete('/api/transactions/:id', ({ params }) => {
      kept = kept.filter(({ id }) => String(id) !== params.id)
      if (kept.length === 0) server.use(signedInAs({ currency_locked: false }))
      return new HttpResponse(null, { status: 204 })
    }),
  )
}

const confirmDelete = async (user: ReturnType<typeof renderApp>['user']) => {
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Delete transaction',
    }),
  )
}

test('deleting from a row’s Delete moves focus to the Delete of the row now in its slot', async () => {
  stored([rent, lidl, cinema])
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Delete transaction Rent' }),
  )
  await confirmDelete(user)

  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: 'Delete transaction Lidl' }),
    ).toHaveFocus()
  })
})

test('deleting the last row on the page moves focus to the new last row’s Delete', async () => {
  stored([rent, lidl, cinema])
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Delete transaction Cinema' }),
  )
  await confirmDelete(user)

  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: 'Delete transaction Lidl' }),
    ).toHaveFocus()
  })
})

test('deleting from a phone row’s ⋯ menu moves focus to the ⋯ of the row now in its slot', async () => {
  stored([rent, lidl, cinema])
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Actions for Rent' }),
  )
  await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
  await confirmDelete(user)

  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: 'Actions for Lidl' }),
    ).toHaveFocus()
  })
})

test('deleting from the edit dialog moves focus to the Edit of the row now in its slot', async () => {
  stored([rent, lidl, cinema])
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Edit transaction Rent' }),
  )
  await user.click(
    within(screen.getByRole('dialog', { name: 'Edit transaction' })).getByRole(
      'button',
      { name: 'Delete…' },
    ),
  )
  await confirmDelete(user)

  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: 'Edit transaction Lidl' }),
    ).toHaveFocus()
  })
})

test('deleting from the edit sheet a phone row opened moves focus to the row now in its slot', async () => {
  stored([rent, lidl, cinema])
  const { user } = renderApp('/transactions')

  const list = await screen.findByRole('list', { name: 'Transactions' })
  await user.click(within(list).getByRole('button', { name: /^Rent/ }))
  await user.click(
    within(screen.getByRole('dialog', { name: 'Edit transaction' })).getByRole(
      'button',
      { name: 'Delete transaction' },
    ),
  )
  await confirmDelete(user)

  await waitFor(() => {
    expect(within(list).getByRole('button', { name: /^Lidl/ })).toHaveFocus()
  })
})

test('deleting from the edit sheet a phone row’s ⋯ Edit opened moves focus to the row now in its slot', async () => {
  stored([rent, lidl, cinema])
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Actions for Rent' }),
  )
  await user.click(screen.getByRole('menuitem', { name: 'Edit' }))
  await user.click(
    within(screen.getByRole('dialog', { name: 'Edit transaction' })).getByRole(
      'button',
      { name: 'Delete transaction' },
    ),
  )
  await confirmDelete(user)

  const list = screen.getByRole('list', { name: 'Transactions' })
  await waitFor(() => {
    expect(within(list).getByRole('button', { name: /^Lidl/ })).toHaveFocus()
  })
})

test('emptying a page moves focus to the last row of the nearest page', async () => {
  stored([rent, lidl, cinema, bakery])
  const { user } = renderApp('/transactions?page=2')

  await user.click(
    await screen.findByRole('button', { name: 'Delete transaction Bakery' }),
  )
  await confirmDelete(user)

  expect(await screen.findByText('Page 1 of 1')).toBeInTheDocument()
  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: 'Delete transaction Cinema' }),
    ).toHaveFocus()
  })
})

test('deleting the last transaction moves focus to the Transactions heading', async () => {
  stored([taxi])
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Delete transaction Taxi' }),
  )
  await confirmDelete(user)

  expect(
    await screen.findByRole('heading', {
      name: 'Record your first transaction',
    }),
  ).toBeInTheDocument()
  await waitFor(() => {
    expect(
      screen.getByRole('heading', { level: 1, name: 'Transactions' }),
    ).toHaveFocus()
  })
})

test('deleting the last transaction the filters show moves focus to the Transactions heading', async () => {
  stored([rent, taxi])
  let deletedTaxi = false
  server.use(
    http.get('/api/transactions', ({ request }) => {
      // Only Taxi matches q=taxi, until it is deleted.
      if (new URL(request.url).searchParams.get('q') !== 'taxi') return
      return HttpResponse.json<TransactionPage>({
        data: deletedTaxi ? [] : [taxi],
        meta: {
          page: 1,
          total_pages: 1,
          total_count: deletedTaxi ? 0 : 1,
          period: '2026-10',
          totals: { expense: 0, income: 0, net: 0 },
          untagged_count: 0,
        },
      })
    }),
  )
  server.use(
    http.delete('/api/transactions/:id', () => {
      deletedTaxi = true
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { user } = renderApp('/transactions?q=taxi')

  await user.click(
    await screen.findByRole('button', { name: 'Delete transaction Taxi' }),
  )
  await confirmDelete(user)

  await waitFor(() => {
    expect(
      screen.getByRole('heading', { level: 1, name: 'Transactions' }),
    ).toHaveFocus()
  })
})

test('screen readers hear that the transaction was deleted', async () => {
  stored([rent, lidl])
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Delete transaction Rent' }),
  )
  await confirmDelete(user)

  expect(await screen.findByText('Transaction deleted.')).toHaveAttribute(
    'role',
    'status',
  )
})

test('when the list can’t reload after a delete, focus goes to the heading and stays put after', async () => {
  stored([rent, lidl, cinema])
  server.use(
    http.delete('/api/transactions/:id', () => {
      // A refusal, which isn't retried, so the list fails at once.
      server.use(
        http.get('/api/transactions', () =>
          HttpResponse.json(null, { status: 400 }),
        ),
      )
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Delete transaction Rent' }),
  )
  await confirmDelete(user)

  await waitFor(() => {
    expect(
      screen.getByRole('heading', { level: 1, name: 'Transactions' }),
    ).toHaveFocus()
  })
  stored([lidl, cinema])
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByRole('button', { name: 'Delete transaction Lidl' })
  const search = screen.getByRole('searchbox', { name: 'Search descriptions' })
  await user.type(search, 'l')

  expect(search).toHaveFocus()
})
