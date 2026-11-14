import { act, screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, expect, onTestFinished, test, vi } from 'vitest'
import type { RequestBody } from '@/api/client'
import type { components } from '@/api/schema'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { type Problem, signedInAs } from '@/test/sessionHandlers'

type Tag = components['schemas']['Tag']
type TagList = components['schemas']['TagList']
type Transaction = components['schemas']['Transaction']
type TransactionPage = components['schemas']['TransactionPage']

const rent: Transaction = {
  id: 1,
  amount: 210000,
  kind: 'expense',
  date: '2026-10-03',
  description: 'Rent',
  tags: [],
}
const salary: Transaction = {
  id: 2,
  amount: 820000,
  kind: 'income',
  date: '2026-10-05',
  description: 'October salary',
  tags: [],
}

const pageMeta = (
  meta: Partial<TransactionPage['meta']> = {},
): TransactionPage['meta'] => ({
  page: 1,
  total_pages: 1,
  total_count: 0,
  period: '2026-10',
  totals: { expense: 0, income: 0, net: 0 },
  untagged_count: 0,
  ...meta,
})

// A description cell; on a tablet it also holds the row's tags, so its name starts with the description.
const descriptionCell = (description: string) => ({
  name: new RegExp(`^${description}( |$)`),
})

const months = (data: string[]) =>
  http.get('/api/transaction_months', () => HttpResponse.json<string[]>(data))

const tagsListed = (data: Tag[]) =>
  http.get('/api/tags', () => HttpResponse.json<TagList>({ data }))

beforeEach(() => {
  server.use(months(['2026-10']), tagsListed([]))
})

const listed = (
  data: Transaction[],
  meta: Partial<TransactionPage['meta']> = {},
) =>
  http.get('/api/transactions', () =>
    HttpResponse.json<TransactionPage>({
      data,
      meta: pageMeta({ total_count: data.length, ...meta }),
    }),
  )

test('the list shows this month’s transactions with date, description and amount', async () => {
  server.use(signedInAs({ currency_locked: true }), listed([salary, rent]))

  renderApp('/transactions')

  const table = await screen.findByRole('table')
  const [, ...rows] = within(table).getAllByRole('row')
  expect(rows.map((row) => row.textContent)).toEqual([
    // Add tags twice: under the description on a tablet, in its own column on desktop.
    '5 OctOctober salaryAdd tagsAdd tags+8 200,00 PLN',
    '3 OctRentAdd tagsAdd tags−2 100,00 PLN',
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
        meta: pageMeta({
          page: Number(page ?? 1),
          total_pages: 2,
          total_count: 26,
        }),
      })
    }),
  )
  const { user, router } = renderApp('/transactions')

  expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Next page' }))

  expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
  expect(screen.getByRole('cell', descriptionCell('Rent'))).toBeInTheDocument()
  expect(router.state.location.search).toBe('?page=2')
  expect(asked).toEqual([null, '2'])
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
})

test('the totals card shows expenses, income and net over the filters, with a caption naming them', async () => {
  server.use(
    signedInAs({ currency_locked: true }),
    listed([salary, rent], {
      totals: { expense: 428640, income: 820000, net: 391360 },
    }),
  )

  renderApp('/transactions')

  expect(
    await screen.findByRole('region', { name: 'Totals for these filters' }),
  ).toHaveTextContent(
    'Expenses4 286,40 PLNIncome8 200,00 PLNNet+3 913,60 PLNOctober 2026 · all types',
  )
})

test('a net below zero reads with a minus', async () => {
  server.use(
    signedInAs({ currency_locked: true }),
    listed([rent], { totals: { expense: 14260, income: 0, net: -14260 } }),
  )

  renderApp('/transactions')

  expect(
    await screen.findByRole('region', { name: 'Totals for these filters' }),
  ).toHaveTextContent('Net−142,60 PLN')
})

test('the period select offers the months with transactions, newest first, then All time, on this month', async () => {
  server.use(
    signedInAs({ currency_locked: true }),
    months(['2026-10', '2026-09', '2025-12']),
    listed([rent]),
  )

  renderApp('/transactions')

  const period = await screen.findByRole('combobox', { name: 'Time period' })
  await vi.waitFor(() => {
    expect(
      within(period)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['October 2026', 'September 2026', 'December 2025', 'All time'])
  })
  await vi.waitFor(() => {
    expect(period).toHaveValue('2026-10')
  })
})

test('before the list answers, the period select shows this month, or waits for it', async () => {
  server.use(
    signedInAs({ currency_locked: true }),
    months(['2026-11', '2026-10']),
    http.get('/api/transactions', async () => {
      await delay('infinite')
      return HttpResponse.json(null)
    }),
  )

  renderApp('/transactions')

  const period = await screen.findByRole('combobox', { name: 'Time period' })
  expect(period).toBeDisabled()
  await vi.waitFor(() => {
    expect(period).toHaveValue('2026-11')
  })
  expect(period).toBeEnabled()
})

test('choosing a period, a type and a search narrows the list and keeps them in the address', async () => {
  const asked: string[] = []
  server.use(
    signedInAs({ currency_locked: true }),
    months(['2026-10', '2026-09']),
    http.get('/api/transactions', ({ request }) => {
      const query = new URL(request.url).searchParams
      asked.push(query.toString())
      return HttpResponse.json<TransactionPage>({
        data: [query.has('q') ? { ...rent, description: 'Żabka' } : rent],
        meta: pageMeta({
          total_count: 1,
          period: query.get('period') ?? '2026-10',
        }),
      })
    }),
  )
  const { user, router } = renderApp('/transactions')
  await screen.findByRole('region', { name: 'Totals for these filters' })

  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Time period' }),
    'September 2026',
  )
  await user.click(
    within(screen.getByRole('group', { name: 'Type' })).getByRole('button', {
      name: 'Income',
    }),
  )
  const search = screen.getByLabelText('Search descriptions')
  await user.type(search, 'zabka')

  expect(
    await screen.findByRole('cell', descriptionCell('Żabka')),
  ).toBeInTheDocument()
  expect(search).toHaveValue('zabka')
  expect(search).toHaveFocus()
  expect(
    within(screen.getByRole('group', { name: 'Type' })).getByRole('button', {
      name: 'Income',
    }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(router.state.location.search).toBe(
    '?period=2026-09&kind=income&q=zabka',
  )
  expect(asked.at(-1)).toBe('period=2026-09&kind=income&q=zabka')
  expect(
    screen.getByRole('region', { name: 'Totals for these filters' }),
  ).toHaveTextContent('September 2026 · income only · “zabka”')
})

test('a link with filters opens on them, and values the list doesn’t offer are dropped', async () => {
  const asked: string[] = []
  server.use(
    signedInAs({ currency_locked: true }),
    http.get('/api/transactions', ({ request }) => {
      asked.push(new URL(request.url).searchParams.toString())
      return HttpResponse.json<TransactionPage>({
        data: [rent],
        meta: pageMeta({ total_count: 1 }),
      })
    }),
  )

  renderApp('/transactions?period=2026-13&kind=transfer&q=rent')

  expect(
    await screen.findByRole('cell', descriptionCell('Rent')),
  ).toBeInTheDocument()
  expect(asked).toEqual(['q=rent'])
  expect(screen.getByLabelText('Search descriptions')).toHaveValue('rent')
  expect(
    screen.getByRole('region', { name: 'Totals for these filters' }),
  ).toHaveTextContent('October 2026 · all types · “rent”')
})

test('a link to all time of expenses opens on them', async () => {
  server.use(
    signedInAs({ currency_locked: true }),
    listed([rent], { period: 'all' }),
  )

  renderApp('/transactions?period=all&kind=expense')

  expect(
    await screen.findByRole('region', { name: 'Totals for these filters' }),
  ).toHaveTextContent('All time · expenses only')
  expect(screen.getByRole('combobox', { name: 'Time period' })).toHaveValue(
    'all',
  )
})

test('changing a filter goes back to page 1, and paging keeps the filters', async () => {
  server.use(
    signedInAs({ currency_locked: true }),
    listed([rent], { page: 2, total_pages: 3, total_count: 60 }),
  )
  const { user, router } = renderApp('/transactions?q=rent&page=2')

  await user.click(await screen.findByRole('button', { name: 'Next page' }))
  expect(router.state.location.search).toBe('?q=rent&page=3')
  await user.click(
    within(screen.getByRole('group', { name: 'Type' })).getByRole('button', {
      name: 'Expense',
    }),
  )

  expect(router.state.location.search).toBe('?kind=expense&q=rent')
})

test('with nothing over all time, the page offers to clear the search and type instead', async () => {
  server.use(
    signedInAs({ currency_locked: true }),
    listed([], { period: 'all' }),
  )

  renderApp('/transactions?period=all&q=zabka')

  const empty = await screen.findByRole('region', {
    name: 'No transactions match these filters',
  })
  expect(empty).toHaveTextContent('Try a different search or type.')
  expect(
    within(empty).getByRole('button', { name: 'Clear filters' }),
  ).toBeInTheDocument()
  expect(
    within(empty).queryByRole('button', { name: 'Show All time' }),
  ).not.toBeInTheDocument()
})

test('this month chosen by hand is no filter to clear', async () => {
  server.use(
    signedInAs({ currency_locked: true }),
    months(['2026-10', '2026-09']),
    listed([]),
  )

  renderApp('/transactions?period=2026-10')

  const empty = await screen.findByRole('region', {
    name: 'No transactions match these filters',
  })
  await vi.waitFor(() => {
    expect(
      within(empty).queryByRole('button', { name: 'Clear filters' }),
    ).not.toBeInTheDocument()
  })
})

test('another month is a filter to clear', async () => {
  server.use(
    signedInAs({ currency_locked: true }),
    months(['2026-10', '2026-09']),
    listed([], { period: '2026-09' }),
  )

  renderApp('/transactions?period=2026-09')

  const empty = await screen.findByRole('region', {
    name: 'No transactions match these filters',
  })
  expect(
    await within(empty).findByRole('button', { name: 'Clear filters' }),
  ).toBeInTheDocument()
})

test('Clear filters goes back to this month with every filter off', async () => {
  server.use(signedInAs({ currency_locked: true }), listed([]))
  const { user, router } = renderApp(
    '/transactions?period=2026-09&kind=income&q=zabka',
  )

  await user.click(await screen.findByRole('button', { name: 'Clear filters' }))

  expect(router.state.location.search).toBe('')
  expect(screen.getByLabelText('Search descriptions')).toHaveValue('')
})

test('while a filter change loads, the last results stay up marked busy', async () => {
  server.use(
    signedInAs({ currency_locked: true }),
    http.get('/api/transactions', async ({ request }) => {
      if (new URL(request.url).searchParams.has('kind')) await delay('infinite')
      return HttpResponse.json<TransactionPage>({
        data: [rent],
        meta: pageMeta({ total_count: 1 }),
      })
    }),
  )
  const { user } = renderApp('/transactions')
  const totals = await screen.findByRole('region', {
    name: 'Totals for these filters',
  })

  await user.click(screen.getByRole('button', { name: 'Expense' }))

  expect(totals.closest('[aria-busy="true"]')).not.toBeNull()
  expect(screen.getByRole('cell', descriptionCell('Rent'))).toBeInTheDocument()
  expect(totals).toHaveTextContent('October 2026 · all types')
})

test('the search box follows the address when it changes some other way', async () => {
  server.use(signedInAs({ currency_locked: true }), listed([rent]))
  const { router } = renderApp('/transactions?q=zabka')
  const search = await screen.findByLabelText('Search descriptions')
  expect(search).toHaveValue('zabka')

  await act(() => router.navigate('/transactions'))
  expect(screen.getByLabelText('Search descriptions')).toHaveValue('')
  await act(() => router.navigate(-1))

  expect(screen.getByLabelText('Search descriptions')).toHaveValue('zabka')
})

test('Show All time keeps the type and search, over every month', async () => {
  server.use(signedInAs({ currency_locked: true }), listed([]))
  const { user, router } = renderApp('/transactions?kind=income&q=zabka')

  await user.click(await screen.findByRole('button', { name: 'Show All time' }))

  expect(router.state.location.search).toBe('?period=all&kind=income&q=zabka')
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
  expect(screen.queryByLabelText('Search descriptions')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('region', { name: 'Totals for these filters' }),
  ).not.toBeInTheDocument()
})

test('with nothing in the chosen month, the page says no transactions match and offers a way out', async () => {
  server.use(signedInAs({ currency_locked: true }), listed([]))

  renderApp('/transactions')

  const empty = await screen.findByRole('region', {
    name: 'No transactions match these filters',
  })
  expect(empty).toHaveTextContent('Try another month or All time.')
  expect(
    within(empty).getByRole('button', { name: 'Show All time' }),
  ).toBeInTheDocument()
  expect(
    within(empty).queryByRole('button', { name: 'Clear filters' }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('region', { name: 'Totals for these filters' }),
  ).toHaveTextContent('Expenses0,00 PLNIncome0,00 PLNNet0,00 PLN')
  expect(
    screen.queryByRole('heading', { name: 'Record your first transaction' }),
  ).not.toBeInTheDocument()
})

test('the list says it is loading', async () => {
  server.use(
    signedInAs({ currency_locked: true }),
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
  expect(
    screen.queryByRole('region', { name: 'Totals for these filters' }),
  ).not.toBeInTheDocument()
  expect(screen.getByLabelText('Search descriptions')).toBeEnabled()
  expect(
    screen.getByText(
      'Totals are hidden until the list loads, so they never disagree with it.',
    ),
  ).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(
    await screen.findByRole('cell', descriptionCell('Rent')),
  ).toBeInTheDocument()
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
    await screen.findByRole('cell', descriptionCell('October salary')),
  ).toBeInTheDocument()
  expect(sent).toEqual({
    amount: 820050,
    kind: 'income',
    date: '2026-10-05',
    description: 'October salary',
    tag_ids: [],
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

test('the first transaction, dated last month, leaves the first-run state for a quiet month', async () => {
  const september: Transaction = { ...rent, date: '2026-09-30' }
  server.use(
    signedInAs({ currency_locked: false }),
    listed([]),
    http.post('/api/transactions', () => {
      server.use(signedInAs({ currency_locked: true }))
      return HttpResponse.json<Transaction>(september, { status: 201 })
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    within(
      await screen.findByRole('region', {
        name: 'Record your first transaction',
      }),
    ).getByRole('button', { name: 'Add transaction' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Add transaction' })
  await user.type(within(dialog).getByLabelText('Amount'), '2100')
  await user.clear(within(dialog).getByLabelText('Date'))
  await user.type(within(dialog).getByLabelText('Date'), '2026-09-30')
  await user.click(
    within(dialog).getByRole('button', { name: 'Save transaction' }),
  )

  expect(
    await screen.findByRole('heading', {
      name: 'No transactions match these filters',
    }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: 'Record your first transaction' }),
  ).not.toBeInTheDocument()
})

test('a date before 2000 shows on the date field', async () => {
  server.use(signedInAs({ currency_locked: true }), listed([rent]))
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Add transaction' }),
  )
  const date = within(
    screen.getByRole('dialog', { name: 'Add transaction' }),
  ).getByLabelText('Date')
  await user.clear(date)
  await user.type(date, '1999-12-31')
  await user.tab()

  expect(date).toHaveAttribute('min', '2000-01-01')
  expect(date).toHaveAccessibleDescription(
    'The date can’t be before 1 Jan 2000.',
  )
})

test('a save that fails keeps what was typed and offers to try again', async () => {
  let saves = 0
  server.use(
    signedInAs({ currency_locked: true }),
    listed([rent]),
    http.post('/api/transactions', () => {
      saves += 1
      if (saves === 1) return new HttpResponse(null, { status: 500 })
      server.use(listed([salary, rent]))
      return HttpResponse.json<Transaction>(salary, { status: 201 })
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Add transaction' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Add transaction' })
  await user.type(within(dialog).getByLabelText('Amount'), '8200')
  await user.click(
    within(dialog).getByRole('button', { name: 'Save transaction' }),
  )

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Couldn’t save the transaction.',
  )
  expect(within(dialog).getByLabelText('Amount')).toHaveValue('8 200,00')
  await user.click(within(dialog).getByRole('button', { name: 'Try again' }))

  expect(
    await screen.findByRole('cell', descriptionCell('October salary')),
  ).toBeInTheDocument()
  expect(saves).toBe(2)
})

const editable = () => signedInAs({ currency_locked: true })

test('a row’s edit action opens the dialog prefilled, and saving updates the row in place', async () => {
  let sent: NewTransaction | undefined
  server.use(
    editable(),
    listed([salary, rent]),
    http.patch('/api/transactions/:id', async ({ request, params }) => {
      sent = (await request.json()) as NewTransaction
      const saved: Transaction = { ...rent, ...sent, id: Number(params.id) }
      server.use(listed([salary, saved]))
      return HttpResponse.json<Transaction>(saved)
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Edit transaction Rent' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Edit transaction' })
  expect(within(dialog).getByLabelText('Amount')).toHaveValue('2 100,00')
  expect(
    within(dialog).getByRole('button', { name: 'Expense' }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-10-03')
  expect(within(dialog).getByLabelText(/Description/)).toHaveValue('Rent')
  await user.clear(within(dialog).getByLabelText(/Description/))
  await user.type(within(dialog).getByLabelText(/Description/), 'Rent, October')
  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

  expect(
    await screen.findByRole('cell', descriptionCell('Rent, October')),
  ).toBeInTheDocument()
  expect(sent).toEqual({
    amount: 210000,
    kind: 'expense',
    date: '2026-10-03',
    description: 'Rent, October',
    tag_ids: [],
  })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('a row with no description is named by its date and amount', async () => {
  server.use(editable(), listed([{ ...rent, description: '' }]))

  renderApp('/transactions')

  expect(
    await screen.findByRole('button', {
      name: 'Edit transaction 3 Oct −2 100,00 PLN',
    }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', {
      name: 'Delete transaction 3 Oct −2 100,00 PLN',
    }),
  ).toBeInTheDocument()
})

test('the edit dialog shows broken rules on their fields, as adding does', async () => {
  let saves = 0
  server.use(
    editable(),
    listed([rent]),
    http.patch('/api/transactions/:id', () => {
      saves += 1
      return HttpResponse.json<Transaction>(rent)
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Edit transaction Rent' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Edit transaction' })
  await user.clear(within(dialog).getByLabelText('Amount'))
  await user.type(within(dialog).getByLabelText('Amount'), '0')
  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

  expect(within(dialog).getByRole('alert')).toHaveTextContent(
    'Fix the field marked below.',
  )
  expect(within(dialog).getByLabelText('Amount')).toHaveAccessibleDescription(
    'Enter an amount above 0.',
  )
  expect(saves).toBe(0)
})

test('an edit that fails to save keeps the changes and offers to try again', async () => {
  let saves = 0
  server.use(
    editable(),
    listed([rent]),
    http.patch('/api/transactions/:id', () => {
      saves += 1
      if (saves === 1) return new HttpResponse(null, { status: 500 })
      server.use(listed([{ ...rent, amount: 220000 }]))
      return HttpResponse.json<Transaction>({ ...rent, amount: 220000 })
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Edit transaction Rent' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Edit transaction' })
  await user.clear(within(dialog).getByLabelText('Amount'))
  await user.type(within(dialog).getByLabelText('Amount'), '2200')
  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Couldn’t save the transaction.',
  )
  expect(within(dialog).getByLabelText('Amount')).toHaveValue('2 200,00')
  await user.click(within(dialog).getByRole('button', { name: 'Try again' }))

  expect(
    await screen.findByRole('cell', { name: '−2 200,00 PLN' }),
  ).toBeInTheDocument()
  expect(saves).toBe(2)
})

test('editing a transaction deleted elsewhere says it is gone, and it leaves the list', async () => {
  server.use(
    editable(),
    listed([salary, rent]),
    http.patch('/api/transactions/:id', () => {
      server.use(listed([salary]))
      return HttpResponse.json<Problem>(
        { type: 'about:blank', title: 'Not found', status: 404 },
        { status: 404 },
      )
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Edit transaction Rent' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Edit transaction' })
  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'This transaction was deleted elsewhere.',
  )
  await vi.waitFor(() => {
    expect(
      screen.queryByRole('cell', descriptionCell('Rent')),
    ).not.toBeInTheDocument()
  })
})

test('deleting asks first, shows the row, and confirming removes it', async () => {
  let deleted: string | undefined
  server.use(
    editable(),
    listed([salary, rent]),
    http.delete('/api/transactions/:id', ({ params }) => {
      deleted = String(params.id)
      server.use(listed([salary]))
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Delete transaction Rent' }),
  )
  const confirm = screen.getByRole('alertdialog', {
    name: /Delete this transaction\?/,
  })
  expect(confirm).toHaveAccessibleDescription(
    /It leaves your totals and tag amounts\. This can’t be undone\./,
  )
  expect(confirm).toHaveTextContent('Rent · 3 Oct−2 100,00 PLN')
  await user.click(
    within(confirm).getByRole('button', { name: 'Delete transaction' }),
  )

  await vi.waitFor(() => {
    expect(
      screen.queryByRole('cell', descriptionCell('Rent')),
    ).not.toBeInTheDocument()
  })
  expect(deleted).toBe('1')
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

test('cancelling the confirmation keeps the row', async () => {
  let deletes = 0
  server.use(
    editable(),
    listed([rent]),
    http.delete('/api/transactions/:id', () => {
      deletes += 1
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Delete transaction Rent' }),
  )
  // Desktop's Cancel comes first; the phone's follows Delete.
  await user.click(
    within(screen.getByRole('alertdialog')).getAllByRole('button', {
      name: 'Cancel',
    })[0] as HTMLElement,
  )

  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(screen.getByRole('cell', descriptionCell('Rent'))).toBeInTheDocument()
  expect(deletes).toBe(0)
})

test('the edit dialog’s Delete… asks first, and confirming closes both', async () => {
  server.use(
    editable(),
    listed([salary, rent]),
    http.delete('/api/transactions/:id', () => {
      server.use(listed([salary]))
      return new HttpResponse(null, { status: 204 })
    }),
  )
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
  await user.click(
    within(
      screen.getByRole('alertdialog', { name: /Delete this transaction\?/ }),
    ).getByRole('button', { name: 'Delete transaction' }),
  )

  await vi.waitFor(() => {
    expect(
      screen.queryByRole('cell', descriptionCell('Rent')),
    ).not.toBeInTheDocument()
  })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

test('a delete that fails keeps the confirmation open and offers to try again', async () => {
  let deletes = 0
  server.use(
    editable(),
    listed([salary, rent]),
    http.delete('/api/transactions/:id', () => {
      deletes += 1
      if (deletes === 1) return new HttpResponse(null, { status: 500 })
      server.use(listed([salary]))
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Delete transaction Rent' }),
  )
  const confirm = screen.getByRole('alertdialog')
  await user.click(
    within(confirm).getByRole('button', { name: 'Delete transaction' }),
  )

  expect(await within(confirm).findByRole('alert')).toHaveTextContent(
    'Couldn’t delete the transaction.',
  )
  await user.click(within(confirm).getByRole('button', { name: 'Try again' }))

  await vi.waitFor(() => {
    expect(
      screen.queryByRole('cell', descriptionCell('Rent')),
    ).not.toBeInTheDocument()
  })
  expect(deletes).toBe(2)
})

test('a transaction already deleted elsewhere just leaves the list', async () => {
  server.use(
    editable(),
    listed([salary, rent]),
    http.delete('/api/transactions/:id', () => {
      server.use(listed([salary]))
      return HttpResponse.json<Problem>(
        { type: 'about:blank', title: 'Not found', status: 404 },
        { status: 404 },
      )
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Delete transaction Rent' }),
  )
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Delete transaction',
    }),
  )

  await vi.waitFor(() => {
    expect(
      screen.queryByRole('cell', descriptionCell('Rent')),
    ).not.toBeInTheDocument()
  })
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

test('deleting the only row on page 2 lands on page 1', async () => {
  server.use(
    editable(),
    http.get('/api/transactions', ({ request }) => {
      const page = new URL(request.url).searchParams.get('page')
      return HttpResponse.json<TransactionPage>({
        data: page === '2' ? [rent] : [salary],
        meta: pageMeta({
          page: Number(page ?? 1),
          total_pages: 2,
          total_count: 26,
        }),
      })
    }),
    http.delete('/api/transactions/:id', () => {
      // The API shows the nearest page once page 2 is gone.
      server.use(
        http.get('/api/transactions', () =>
          HttpResponse.json<TransactionPage>({
            data: [salary],
            meta: pageMeta({ total_count: 25 }),
          }),
        ),
      )
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { user, router } = renderApp('/transactions?page=2')

  await user.click(
    await screen.findByRole('button', { name: 'Delete transaction Rent' }),
  )
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Delete transaction',
    }),
  )

  expect(await screen.findByText('Page 1 of 1')).toBeInTheDocument()
  expect(router.state.location.search).toBe('')
})

test('deleting the last transaction brings back the first-run state', async () => {
  server.use(
    editable(),
    listed([rent]),
    http.delete('/api/transactions/:id', () => {
      server.use(signedInAs({ currency_locked: false }), listed([]))
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Delete transaction Rent' }),
  )
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Delete transaction',
    }),
  )

  expect(
    await screen.findByRole('heading', {
      name: 'Record your first transaction',
    }),
  ).toBeInTheDocument()
})

test('on a phone, each transaction is a row, and tapping one opens it for editing', async () => {
  server.use(editable(), listed([salary, { ...rent, description: '' }]))
  const { user } = renderApp('/transactions')

  const list = await screen.findByRole('list', { name: 'Transactions' })
  expect(
    within(list)
      .getAllByRole('listitem')
      .map((row) => row.textContent),
  ).toEqual([
    'October salary · 5 Oct+8 200,00 PLNNo tags',
    '3 Oct−2 100,00 PLNNo tags',
  ])
  await user.click(within(list).getByRole('button', { name: /^3 Oct/ }))

  const dialog = screen.getByRole('dialog', { name: 'Edit transaction' })
  expect(within(dialog).getByLabelText('Amount')).toHaveValue('2 100,00')
})

test('a phone row’s actions menu offers Edit and Delete, and Escape returns to it', async () => {
  server.use(editable(), listed([salary, rent]))
  const { user } = renderApp('/transactions')
  const actions = await screen.findByRole('button', {
    name: 'Actions for Rent',
  })

  await user.click(actions)

  const menu = screen.getByRole('menu', { name: 'Actions for Rent' })
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent),
  ).toEqual(['Edit', 'Delete'])
  expect(within(menu).getByRole('menuitem', { name: 'Edit' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(actions).toHaveFocus()
})

test('a phone row’s Edit opens the sheet prefilled', async () => {
  server.use(editable(), listed([salary, rent]))
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Actions for Rent' }),
  )
  await user.click(screen.getByRole('menuitem', { name: 'Edit' }))

  const dialog = screen.getByRole('dialog', { name: 'Edit transaction' })
  expect(within(dialog).getByLabelText(/Description/)).toHaveValue('Rent')
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

test('a phone row’s Delete asks first, and confirming removes the row', async () => {
  server.use(
    editable(),
    listed([salary, rent]),
    http.delete('/api/transactions/:id', () => {
      server.use(listed([salary]))
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Actions for Rent' }),
  )
  await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Delete transaction',
    }),
  )

  await vi.waitFor(() => {
    expect(
      screen.queryByRole('button', { name: 'Actions for Rent' }),
    ).not.toBeInTheDocument()
  })
})

test('the sheet’s header Save saves, as the button below does', async () => {
  let saves = 0
  server.use(
    editable(),
    listed([rent]),
    http.post('/api/transactions', () => {
      saves += 1
      server.use(listed([salary, rent]))
      return HttpResponse.json<Transaction>(salary, { status: 201 })
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Add transaction' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Add transaction' })
  await user.type(within(dialog).getByLabelText('Amount'), '8200')
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))

  expect(
    await screen.findByRole('cell', descriptionCell('October salary')),
  ).toBeInTheDocument()
  expect(saves).toBe(1)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('the sheet’s header Cancel closes it without saving', async () => {
  server.use(editable(), listed([rent]))
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Edit transaction Rent' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Edit transaction' })
  // The sheet's header Cancel comes first; the desktop one sits by Save.
  const headerCancel = within(dialog).getAllByRole('button', {
    name: 'Cancel',
  })[0] as HTMLElement
  await user.click(headerCancel)

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('the edit sheet’s Delete transaction asks first', async () => {
  server.use(editable(), listed([rent]))
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

  expect(screen.getByRole('alertdialog')).toBeVisible()
})

test('on a phone the confirmation names the transaction, its amount and day', async () => {
  server.use(editable(), listed([salary, rent]))
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', { name: 'Actions for Rent' }),
  )
  await user.click(screen.getByRole('menuitem', { name: 'Delete' }))

  const confirm = screen.getByRole('alertdialog', { name: /Delete “Rent”\?/ })
  expect(confirm).toHaveAccessibleDescription(
    /−2 100,00 PLN · 3 Oct\. This can’t be undone\./,
  )
})

test('a confirmation for a transaction with no description asks plainly', async () => {
  server.use(editable(), listed([{ ...rent, description: '' }]))
  const { user } = renderApp('/transactions')

  await user.click(
    await screen.findByRole('button', {
      name: 'Delete transaction 3 Oct −2 100,00 PLN',
    }),
  )

  expect(
    screen.getByRole('alertdialog', { name: 'Delete this transaction?' }),
  ).toBeVisible()
})

test('dragging the sheet down by its header closes it', async () => {
  server.use(editable(), listed([rent]))
  const { user } = renderApp('/transactions')
  await user.click(
    await screen.findByRole('button', { name: 'Add transaction' }),
  )
  const title = within(
    screen.getByRole('dialog', { name: 'Add transaction' }),
  ).getByRole('heading', { name: 'Add transaction' })

  await user.pointer([
    { keys: '[TouchA>]', target: title, coords: { clientY: 100 } },
    { pointerName: 'TouchA', target: title, coords: { clientY: 500 } },
    { keys: '[/TouchA]', target: title, coords: { clientY: 500 } },
  ])

  await vi.waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

test('a short, slow drag springs the sheet back', async () => {
  vi.useFakeTimers({ toFake: ['performance'] })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  server.use(editable(), listed([rent]))
  const { user } = renderApp('/transactions')
  await user.click(
    await screen.findByRole('button', { name: 'Add transaction' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Add transaction' })
  const title = within(dialog).getByRole('heading', {
    name: 'Add transaction',
  })

  await user.pointer([
    { keys: '[TouchA>]', target: title, coords: { clientY: 100 } },
    { pointerName: 'TouchA', target: title, coords: { clientY: 140 } },
  ])
  vi.advanceTimersByTime(500)
  await user.pointer({
    keys: '[/TouchA]',
    target: title,
    coords: { clientY: 140 },
  })

  expect(screen.getByRole('dialog', { name: 'Add transaction' })).toBeVisible()
  expect(dialog.style.transform).toBe('')
})

test('a tap outside the sheet closes it', async () => {
  server.use(editable(), listed([rent]))
  const { user } = renderApp('/transactions')
  await user.click(
    await screen.findByRole('button', { name: 'Add transaction' }),
  )

  // The backdrop belongs to the dialog element itself.
  await user.click(screen.getByRole('dialog', { name: 'Add transaction' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('a press inside the sheet released over the backdrop keeps it open', async () => {
  server.use(editable(), listed([rent]))
  const { user } = renderApp('/transactions')
  await user.click(
    await screen.findByRole('button', { name: 'Add transaction' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Add transaction' })
  const description = within(dialog).getByLabelText(/Description/)
  await user.type(description, 'Groceries')

  await user.pointer([
    { keys: '[MouseLeft>]', target: description },
    { keys: '[/MouseLeft]', target: dialog },
  ])

  expect(screen.getByRole('dialog', { name: 'Add transaction' })).toBeVisible()
  expect(description).toHaveValue('Groceries')
})

test('a right-button drag leaves the sheet open', async () => {
  server.use(editable(), listed([rent]))
  const { user } = renderApp('/transactions')
  await user.click(
    await screen.findByRole('button', { name: 'Add transaction' }),
  )
  const title = within(
    screen.getByRole('dialog', { name: 'Add transaction' }),
  ).getByRole('heading', { name: 'Add transaction' })

  await user.pointer([
    { keys: '[MouseRight>]', target: title, coords: { clientY: 100 } },
    { target: title, coords: { clientY: 500 } },
    { keys: '[/MouseRight]', target: title, coords: { clientY: 500 } },
  ])

  expect(screen.getByRole('dialog', { name: 'Add transaction' })).toBeVisible()
})

test('a tap outside the delete confirmation cancels it', async () => {
  let deletes = 0
  server.use(
    editable(),
    listed([rent]),
    http.delete('/api/transactions/:id', () => {
      deletes += 1
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { user } = renderApp('/transactions')
  await user.click(
    await screen.findByRole('button', { name: 'Delete transaction Rent' }),
  )

  await user.click(screen.getByRole('alertdialog'))

  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(deletes).toBe(0)
})

const tag = (id: number, name: string, extra: Partial<Tag> = {}): Tag => ({
  id,
  name,
  colour: null,
  last_used_at: null,
  ...extra,
})
const chip = ({ id, name, colour }: Tag) => ({ id, name, colour })

const party = tag(1, 'Party', {
  colour: 'lilac',
  last_used_at: '2026-10-09T10:00:00.000Z',
})
const lidl = tag(2, 'Lidl', { last_used_at: '2026-10-05T10:00:00.000Z' })
const zabka = tag(3, 'Żabka')
const zakupy = tag(4, 'Zakupy')
const lodz = tag(5, 'Łódź')
const alcohol = tag(6, 'Alcohol')
const bills = tag(7, 'Bills')
const someTags = [zabka, lidl, zakupy, party, alcohol, lodz, bills]

// Opens Add transaction with these tags loaded, and the tag field focused.
async function openTagField(tags: Tag[] = someTags) {
  let sent: NewTransaction | undefined
  server.use(
    editable(),
    listed([]),
    tagsListed(tags),
    http.post('/api/transactions', async ({ request }) => {
      sent = (await request.json()) as NewTransaction
      return HttpResponse.json<Transaction>(rent, { status: 201 })
    }),
  )
  const { user } = renderApp('/transactions')
  await user.click(
    await screen.findByRole('button', { name: 'Add transaction' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Add transaction' })
  const field = within(dialog).getByRole('combobox', { name: 'Tags' })
  await user.click(field)
  return { user, dialog, field, sent: () => sent }
}

const optionNames = (listbox: HTMLElement) =>
  within(listbox)
    .getAllByRole('option')
    .map((option) => option.textContent.replace(/Enter$/, ''))

test('before typing, the tag field offers recently used tags, newest first, topped up A–Z', async () => {
  const { dialog } = await openTagField()

  const listbox = await within(dialog).findByRole('listbox', {
    name: 'Recently used',
  })
  expect(optionNames(listbox)).toEqual([
    'Party',
    'Lidl',
    'Alcohol',
    'Bills',
    'Łódź',
  ])
  expect(within(dialog).getByText('0 of 5')).toBeInTheDocument()
  expect(
    within(dialog).getByRole('combobox', { name: 'Tags' }),
  ).toHaveAttribute('placeholder', 'Type to find a tag')
})

test('typing filters tags ignoring case and Polish letters, A–Z', async () => {
  const { user, dialog, field } = await openTagField()

  await user.type(field, 'LODZ')
  expect(
    optionNames(
      await within(dialog).findByRole('listbox', { name: 'Matching tags' }),
    ),
  ).toEqual(['Łódź'])
  await user.clear(field)
  await user.type(field, 'z')

  expect(
    optionNames(within(dialog).getByRole('listbox', { name: 'Matching tags' })),
  ).toEqual(['Łódź', 'Zakupy', 'Żabka'])
})

test('arrow keys move and wrap, Enter adds without saving, Backspace removes the last tag', async () => {
  const { user, dialog, field, sent } = await openTagField()
  const active = () =>
    within(dialog).getByRole('option', { selected: true }).textContent

  expect(active()).toBe('PartyEnter')
  expect(field).toHaveAttribute('aria-expanded', 'true')
  await user.keyboard('{ArrowDown}')
  expect(active()).toBe('LidlEnter')
  expect(field).toHaveAttribute(
    'aria-activedescendant',
    within(dialog).getByRole('option', { selected: true }).id,
  )
  await user.keyboard('{ArrowUp}{ArrowUp}')
  expect(active()).toBe('ŁódźEnter')
  await user.keyboard('{Enter}')
  await user.type(field, 'par{Enter}')

  expect(
    within(dialog).getByRole('button', { name: 'Remove tag Party' }),
  ).toBeInTheDocument()
  expect(within(dialog).getByText('2 of 5')).toBeInTheDocument()
  expect(field).toHaveAttribute('placeholder', 'Add a tag')
  expect(sent()).toBeUndefined()
  await user.type(field, 'x{Backspace}{Backspace}')

  expect(
    within(dialog).queryByRole('button', { name: 'Remove tag Party' }),
  ).not.toBeInTheDocument()
  await user.type(within(dialog).getByLabelText('Amount'), '12')
  await user.click(
    within(dialog).getByRole('button', { name: 'Save transaction' }),
  )
  await vi.waitFor(() => {
    expect(sent()?.tag_ids).toEqual([lodz.id])
  })
})

test('a chip’s remove button takes that tag off', async () => {
  const { user, dialog } = await openTagField()
  await user.keyboard('{Enter}{Enter}')

  await user.click(
    within(dialog).getByRole('button', { name: 'Remove tag Party' }),
  )

  expect(
    within(dialog).getAllByRole('button', { name: /^Remove tag/ }),
  ).toHaveLength(1)
  expect(within(dialog).getByRole('combobox', { name: 'Tags' })).toHaveFocus()
})

test('an unknown name says so, and saving goes ahead without it, creating no tag', async () => {
  let tagsCreated = 0
  const { user, dialog, field, sent } = await openTagField()
  server.use(
    http.post('/api/tags', () => {
      tagsCreated += 1
      return new HttpResponse(null, { status: 500 })
    }),
  )

  await user.type(field, 'Cinema{Enter}')

  expect(within(dialog).getByRole('status')).toHaveTextContent(
    'No tag named “Cinema”Save without it and create the tag later on the Tags page.',
  )
  expect(within(dialog).queryByRole('listbox')).not.toBeInTheDocument()
  expect(sent()).toBeUndefined()
  await user.type(within(dialog).getByLabelText('Amount'), '12')
  await user.click(
    within(dialog).getByRole('button', { name: 'Save transaction' }),
  )
  await vi.waitFor(() => {
    expect(sent()?.tag_ids).toEqual([])
  })
  expect(tagsCreated).toBe(0)
})

test('at 5 tags the field says that is the limit and offers no more', async () => {
  const { user, dialog, field } = await openTagField()

  await user.keyboard('{Enter}{Enter}{Enter}{Enter}{Enter}')

  expect(within(dialog).getByRole('status')).toHaveTextContent(
    'That’s the limit of 5 tags. Remove one to add another.',
  )
  expect(within(dialog).getByText('5 of 5')).toBeInTheDocument()
  expect(within(dialog).queryByRole('listbox')).not.toBeInTheDocument()
  expect(field).not.toHaveAttribute('placeholder')
  await user.type(field, 'zab')
  expect(within(dialog).queryByRole('listbox')).not.toBeInTheDocument()
})

test('tags show as chips A–Z: all of them in the table, two and a count on a phone', async () => {
  server.use(
    editable(),
    listed([
      {
        ...rent,
        description: 'Drinks',
        tags: [party, alcohol, lodz, lidl].map(chip),
      },
    ]),
  )

  renderApp('/transactions')

  const table = await screen.findByRole('table')
  // Desktop's Tags column, and tablet's chips under the description.
  const tableChips = within(table)
    .getAllByRole('list', { name: 'Tags' })
    .map((list) =>
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    )
  expect(tableChips).toEqual([
    ['Alcohol', 'Lidl', 'Łódź', 'Party'],
    ['Alcohol', 'Lidl', 'Łódź', 'Party'],
  ])
  const phoneRow = within(
    screen.getByRole('list', { name: 'Transactions' }),
  ).getByRole('button', { name: /^Drinks/ })
  expect(phoneRow).toHaveTextContent(/AlcoholLidl\+22 more: Łódź, Party$/)
  expect(within(phoneRow).getByText('+2')).toHaveAttribute(
    'aria-hidden',
    'true',
  )
})

test('an untagged row offers Add tags, which opens the edit dialog on the tag field; a phone says No tags', async () => {
  server.use(editable(), listed([rent]))
  const { user } = renderApp('/transactions')

  // One under the description on a tablet, one in desktop's Tags column; jsdom shows both.
  const addTags = await screen.findAllByRole('button', {
    name: 'Add tags to Rent',
  })
  expect(addTags).toHaveLength(2)
  expect(
    within(screen.getByRole('list', { name: 'Transactions' })).getByRole(
      'button',
      { name: /^Rent/ },
    ),
  ).toHaveTextContent(/No tags$/)
  await user.click(addTags.at(-1) ?? document.body)

  const dialog = screen.getByRole('dialog', { name: 'Edit transaction' })
  expect(within(dialog).getByRole('combobox', { name: 'Tags' })).toHaveFocus()
})

test('editing shows the transaction’s tags and saves them with any change', async () => {
  let sent: NewTransaction | undefined
  server.use(
    editable(),
    listed([{ ...rent, tags: [chip(party)] }]),
    tagsListed(someTags),
    http.patch('/api/transactions/:id', async ({ request }) => {
      sent = (await request.json()) as NewTransaction
      return HttpResponse.json<Transaction>(rent)
    }),
  )
  const { user } = renderApp('/transactions')
  await user.click(
    await screen.findByRole('button', { name: 'Edit transaction Rent' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Edit transaction' })
  expect(
    within(dialog).getByRole('button', { name: 'Remove tag Party' }),
  ).toBeInTheDocument()

  await user.type(
    within(dialog).getByRole('combobox', { name: 'Tags' }),
    'lidl{Enter}',
  )
  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

  await vi.waitFor(() => {
    expect(sent?.tag_ids).toEqual([party.id, lidl.id])
  })
})

test('a tag deleted elsewhere says so, reloads the tags, and the retry saves without it', async () => {
  const sent: NewTransaction[] = []
  let deleted = false
  let reloads = 0
  server.use(
    editable(),
    listed([{ ...rent, tags: [chip(party), chip(lidl)] }]),
    http.get('/api/tags', () => {
      if (deleted) reloads += 1
      return HttpResponse.json<TagList>({
        data: deleted ? [lidl, bills] : [party, lidl, bills],
      })
    }),
    http.patch('/api/transactions/:id', async ({ request }) => {
      sent.push((await request.json()) as NewTransaction)
      deleted = true
      server.use(
        http.patch('/api/transactions/:id', async ({ request: retry }) => {
          sent.push((await retry.json()) as NewTransaction)
          return HttpResponse.json<Transaction>(rent)
        }),
      )
      return HttpResponse.json<Problem>(
        {
          type: 'tag-not-found',
          title: 'A tag was deleted elsewhere',
          status: 404,
        },
        { status: 404 },
      )
    }),
  )
  const { user } = renderApp('/transactions')
  await user.click(
    await screen.findByRole('button', { name: 'Edit transaction Rent' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Edit transaction' })

  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'A tag was deleted elsewhere.',
  )
  await vi.waitFor(() => {
    expect(
      within(dialog).queryByRole('button', { name: 'Remove tag Party' }),
    ).not.toBeInTheDocument()
  })
  expect(within(dialog).getByText('1 of 5')).toBeInTheDocument()
  expect(reloads).toBe(1)
  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
  await vi.waitFor(() => {
    expect(sent.map((body) => body.tag_ids)).toEqual([
      [party.id, lidl.id],
      [lidl.id],
    ])
  })
})

test('a refused tag set shows on the tag field', async () => {
  server.use(
    editable(),
    listed([rent]),
    http.patch('/api/transactions/:id', () =>
      HttpResponse.json<Problem>(
        {
          type: 'about:blank',
          title: 'Check the highlighted fields',
          status: 422,
          errors: { tag_ids: ['can’t be more than 5'] },
        },
        { status: 422 },
      ),
    ),
  )
  const { user } = renderApp('/transactions')
  await user.click(
    await screen.findByRole('button', { name: 'Edit transaction Rent' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Edit transaction' })

  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

  const field = within(dialog).getByRole('combobox', { name: 'Tags' })
  await vi.waitFor(() => {
    expect(field).toHaveAccessibleDescription(
      expect.stringContaining('can’t be more than 5'),
    )
  })
  expect(field).toHaveFocus()
})

test('typing a tag already on the transaction offers nothing and says nothing', async () => {
  const { user, dialog, field } = await openTagField()
  await user.type(field, 'lidl{Enter}')

  await user.type(field, 'Lidl')

  expect(within(dialog).queryByRole('status')).not.toBeInTheDocument()
  expect(within(dialog).queryByRole('listbox')).not.toBeInTheDocument()
})
