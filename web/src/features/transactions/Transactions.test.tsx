import { screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { expect, onTestFinished, test, vi } from 'vitest'
import type { RequestBody } from '@/api/client'
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

type NewTransaction = RequestBody<'createTransaction'>

test('adding a transaction saves it, closes the dialog and shows it in the list', async () => {
  let sent: NewTransaction | undefined
  server.use(
    signedInAs({ currency_locked: true }),
    listed([]),
    http.post('/api/transactions', async ({ request }) => {
      sent = (await request.json()) as NewTransaction
      server.use(listed([salary]))
      return HttpResponse.json<Transaction>(salary, { status: 201 })
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Add transaction' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Add transaction' })
  await user.type(within(dialog).getByLabelText('Amount'), '8200.5')
  await user.click(within(dialog).getByRole('button', { name: 'Income' }))
  await user.clear(within(dialog).getByLabelText('Date'))
  await user.type(within(dialog).getByLabelText('Date'), '2026-10-05')
  await user.type(
    within(dialog).getByLabelText(/Description/),
    '  October salary ',
  )
  await user.click(
    within(dialog).getByRole('button', { name: 'Save transaction' }),
  )

  expect(
    await screen.findByRole('cell', { name: 'October salary' }),
  ).toBeInTheDocument()
  expect(sent).toEqual({
    amount: 820050,
    kind: 'income',
    date: '2026-10-05',
    description: 'October salary',
  })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('the dialog starts on an expense dated today, with the currency beside the amount', async () => {
  vi.useFakeTimers({
    now: new Date('2026-10-10T12:00:00.000Z'),
    toFake: ['Date'],
  })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  server.use(
    signedInAs({ currency: 'EUR', currency_locked: true }),
    listed([rent]),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Add transaction' }),
  )

  const dialog = screen.getByRole('dialog', { name: 'Add transaction' })
  expect(within(dialog).getByLabelText('Amount')).toHaveAttribute(
    'placeholder',
    '0,00',
  )
  expect(within(dialog).getByText('EUR')).toBeInTheDocument()
  expect(
    within(dialog).getByRole('button', { name: 'Expense' }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-10-10')
})

test('each broken rule shows on its field, and nothing is saved', async () => {
  vi.useFakeTimers({
    now: new Date('2026-10-10T12:00:00.000Z'),
    toFake: ['Date'],
  })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  let saves = 0
  server.use(
    signedInAs({ currency_locked: true }),
    listed([rent]),
    http.post('/api/transactions', () => {
      saves += 1
      return HttpResponse.json<Transaction>(rent, { status: 201 })
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Add transaction' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Add transaction' })
  await user.type(within(dialog).getByLabelText('Amount'), '0')
  await user.clear(within(dialog).getByLabelText('Date'))
  await user.type(within(dialog).getByLabelText('Date'), '2026-10-14')
  await user.type(within(dialog).getByLabelText(/Description/), 'x'.repeat(201))
  await user.click(
    within(dialog).getByRole('button', { name: 'Save transaction' }),
  )

  expect(within(dialog).getByRole('alert')).toHaveTextContent(
    'Fix the 3 fields marked below.',
  )
  expect(within(dialog).getByLabelText('Amount')).toHaveAccessibleDescription(
    'Enter an amount above 0.',
  )
  expect(within(dialog).getByLabelText('Amount')).toHaveFocus()
  expect(within(dialog).getByLabelText('Date')).toHaveAccessibleDescription(
    'The date can’t be after today (10 Oct 2026).',
  )
  expect(
    within(dialog).getByLabelText(/Description/),
  ).toHaveAccessibleDescription('Keep it to 200 characters. 201 / 200')
  expect(saves).toBe(0)
})

test('the amount field names what is wrong with a typed amount', async () => {
  server.use(signedInAs({ currency_locked: true }), listed([rent]))
  const { user } = renderApp('/transactions')
  await user.click(
    await screen.findByRole('button', { name: 'Add transaction' }),
  )
  const amount = within(
    screen.getByRole('dialog', { name: 'Add transaction' }),
  ).getByLabelText('Amount')

  const leave = async (typed: string) => {
    await user.clear(amount)
    await user.type(amount, typed)
    await user.tab()
  }

  await leave('-84,20')
  expect(amount).toHaveAccessibleDescription(
    'Type the amount without a minus. Type carries the sign.',
  )
  await leave('12,4,0')
  expect(amount).toHaveAccessibleDescription('Enter an amount like 84,20.')
  await leave('1000000000')
  expect(amount).toHaveAccessibleDescription(
    'Amounts go up to 999 999 999,99 PLN.',
  )
  await leave('1234.5')
  expect(amount).toHaveValue('1 234,50')
  expect(amount).not.toHaveAccessibleDescription()
})

test('a rule the server refuses shows on its field', async () => {
  server.use(
    signedInAs({ currency_locked: true }),
    listed([rent]),
    http.post('/api/transactions', () =>
      HttpResponse.json<Problem>(
        {
          type: 'about:blank',
          title: 'Check the highlighted fields',
          status: 422,
          errors: { date: ['can’t be after today'] },
        },
        { status: 422 },
      ),
    ),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Add transaction' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Add transaction' })
  await user.type(within(dialog).getByLabelText('Amount'), '12')
  await user.click(
    within(dialog).getByRole('button', { name: 'Save transaction' }),
  )

  await vi.waitFor(() => {
    expect(within(dialog).getByLabelText('Date')).toHaveAccessibleDescription(
      'can’t be after today',
    )
  })
  expect(screen.getByRole('dialog', { name: 'Add transaction' })).toBeVisible()
})

test('the first-run empty state opens the dialog too', async () => {
  server.use(signedInAs({ currency_locked: false }), listed([]))
  const { user } = renderApp('/transactions')

  const empty = await screen.findByRole('region', {
    name: 'Record your first transaction',
  })
  await user.click(
    within(empty).getByRole('button', { name: 'Add transaction' }),
  )

  expect(screen.getByRole('dialog', { name: 'Add transaction' })).toBeVisible()
})
