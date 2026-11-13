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
    await screen.findByText('Nothing recorded this month yet.'),
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
    await screen.findByRole('cell', { name: 'October salary' }),
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
    await screen.findByRole('cell', { name: 'Rent, October' }),
  ).toBeInTheDocument()
  expect(sent).toEqual({
    amount: 210000,
    kind: 'expense',
    date: '2026-10-03',
    description: 'Rent, October',
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
    expect(screen.queryByRole('cell', { name: 'Rent' })).not.toBeInTheDocument()
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
    name: 'Delete this transaction?',
  })
  expect(confirm).toHaveAccessibleDescription(
    'It leaves your totals and tag amounts. This can’t be undone.',
  )
  expect(confirm).toHaveTextContent('Rent · 3 Oct−2 100,00 PLN')
  await user.click(
    within(confirm).getByRole('button', { name: 'Delete transaction' }),
  )

  await vi.waitFor(() => {
    expect(screen.queryByRole('cell', { name: 'Rent' })).not.toBeInTheDocument()
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
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Cancel',
    }),
  )

  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(screen.getByRole('cell', { name: 'Rent' })).toBeInTheDocument()
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
      screen.getByRole('alertdialog', { name: 'Delete this transaction?' }),
    ).getByRole('button', { name: 'Delete transaction' }),
  )

  await vi.waitFor(() => {
    expect(screen.queryByRole('cell', { name: 'Rent' })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('cell', { name: 'Rent' })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('cell', { name: 'Rent' })).not.toBeInTheDocument()
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
        meta: { page: Number(page ?? 1), total_pages: 2, total_count: 26 },
      })
    }),
    http.delete('/api/transactions/:id', () => {
      // The API shows the nearest page once page 2 is gone.
      server.use(
        http.get('/api/transactions', () =>
          HttpResponse.json<TransactionPage>({
            data: [salary],
            meta: { page: 1, total_pages: 1, total_count: 25 },
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
  ).toEqual(['October salary · 5 Oct+8 200,00 PLN', '3 Oct−2 100,00 PLN'])
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
    await screen.findByRole('cell', { name: 'October salary' }),
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
