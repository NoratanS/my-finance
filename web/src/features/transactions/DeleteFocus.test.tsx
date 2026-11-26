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
